const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        return reject({
          error,
          stdout: stdout || '',
          stderr: stderr || ''
        });
      }

      resolve({
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
}

function escapeJavaString(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function buildRunnerClass(testIds) {
  const tests = [];

  function addTest(id, body) {
    tests.push(`
        try {
            ${body}
            passed++;
            System.out.println("TEST|" + "${escapeJavaString(id)}" + "|passed|");
        } catch (Throwable ex) {
            failed++;
            System.out.println("TEST|" + "${escapeJavaString(id)}" + "|failed|" + ex.getClass().getSimpleName() + ": " + ex.getMessage());
        }
    `);
  }

  for (const id of testIds) {
    switch (id) {
      case 'ctor-owner':
        addTest(id, `
          try {
              new BankAccount("   ", 10);
              throw new RuntimeException("Expected IllegalArgumentException");
          } catch (IllegalArgumentException ok) {}
        `);
        break;

      case 'ctor-balance':
        addTest(id, `
          try {
              new BankAccount("John", -1);
              throw new RuntimeException("Expected IllegalArgumentException");
          } catch (IllegalArgumentException ok) {}
        `);
        break;

      case 'ctor-valid':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 25);
          if (Math.abs(acc.getBalance() - 25.0) > 0.0001) {
              throw new RuntimeException("Balance not initialized");
          }
        `);
        break;

      case 'deposit-add':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 50);
          acc.deposit(100);
          if (Math.abs(acc.getBalance() - 150.0) > 0.0001) {
              throw new RuntimeException("Expected 150.0");
          }
        `);
        break;

      case 'deposit-invalid':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 50);
          try {
              acc.deposit(-10);
              throw new RuntimeException("Expected IllegalArgumentException");
          } catch (IllegalArgumentException ok) {}
        `);
        break;

      case 'deposit-zero':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 50);
          try {
              acc.deposit(0);
              throw new RuntimeException("Expected IllegalArgumentException");
          } catch (IllegalArgumentException ok) {}
        `);
        break;

      case 'withdraw-subtract':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 100);
          acc.withdraw(50);
          if (Math.abs(acc.getBalance() - 50.0) > 0.0001) {
              throw new RuntimeException("Expected 50.0");
          }
        `);
        break;

      case 'withdraw-overdraft':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 100);
          try {
              acc.withdraw(150);
              throw new RuntimeException("Expected IllegalStateException");
          } catch (IllegalStateException ok) {}
        `);
        break;

      case 'withdraw-invalid':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 100);
          try {
              acc.withdraw(0);
              throw new RuntimeException("Expected IllegalArgumentException");
          } catch (IllegalArgumentException ok) {}
        `);
        break;

      case 'balance-return':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 80);
          if (Math.abs(acc.getBalance() - 80.0) > 0.0001) {
              throw new RuntimeException("Expected 80.0");
          }
        `);
        break;

      case 'toString-format':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 80);
          String expected = "John: $80.00";
          if (!expected.equals(acc.toString())) {
              throw new RuntimeException("Expected '" + expected + "' but got '" + acc.toString() + "'");
          }
        `);
        break;

      case 'spy-hidden':
        addTest(id, `
          BankAccount acc = new BankAccount("John", 100);
          acc.withdraw(25);
          if (Math.abs(acc.getBalance() - 75.0) > 0.0001) {
              throw new RuntimeException("Hidden spy trap failed");
          }
        `);
        break;

      default:
        addTest(id, `throw new RuntimeException("Unknown test id: ${escapeJavaString(id)}");`);
        break;
    }
  }

  return `
public class BankAccountTaskTestRunner {
    public static void main(String[] args) {
        int passed = 0;
        int failed = 0;

${tests.join('\n')}

        System.out.println("SUMMARY|" + passed + "|" + failed);
    }
}
`;
}

function parseRunnerOutput(stdout, requestedTestIds) {
  const lines = String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const results = [];
  let summary = { passed: 0, failed: 0 };

  for (const line of lines) {
    if (line.startsWith('TEST|')) {
      const [, id, status, message = ''] = line.split('|');
      results.push({
        id,
        status,
        message
      });
    }

    if (line.startsWith('SUMMARY|')) {
      const [, passed, failed] = line.split('|');
      summary = {
        passed: Number(passed) || 0,
        failed: Number(failed) || 0
      };
    }
  }

  for (const id of requestedTestIds) {
    if (!results.some((result) => result.id === id)) {
      results.push({
        id,
        status: 'failed',
        message: 'Test did not run'
      });
      summary.failed += 1;
    }
  }

  return {
    results,
    ...summary
  };
}

async function runJavaTests(sourceCode, testIds) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codespy-'));
  const bankFile = path.join(tempDir, 'BankAccount.java');
  const runnerFile = path.join(tempDir, 'BankAccountTaskTestRunner.java');

  fs.writeFileSync(bankFile, sourceCode, 'utf8');
  fs.writeFileSync(runnerFile, buildRunnerClass(testIds), 'utf8');

  try {
    await execFileAsync('javac', ['BankAccount.java', 'BankAccountTaskTestRunner.java'], {
      cwd: tempDir,
      timeout: 8000
    });

    const { stdout } = await execFileAsync('java', ['BankAccountTaskTestRunner'], {
      cwd: tempDir,
      timeout: 8000
    });

    return {
      compileError: null,
      runtimeError: null,
      ...parseRunnerOutput(stdout, testIds)
    };
  } catch (failure) {
    const stderr = String(failure.stderr || '');
    const stdout = String(failure.stdout || '');
    const combined = [stderr, stdout].filter(Boolean).join('\n');

    return {
      compileError: combined || 'Compilation failed.',
      runtimeError: null,
      results: testIds.map((id) => ({
        id,
        status: 'failed',
        message: 'Compilation failed'
      })),
      passed: 0,
      failed: testIds.length
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

module.exports = {
  runJavaTests
};