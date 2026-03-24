const scenarios = {
  bank: {
    name: 'Bank Job',
    language: 'java',
    description: 'Implement a BankAccount class',
    skeleton: `public class BankAccount {
    private String owner;
    private double balance;

    public BankAccount(String owner, double initialBalance) {
        this.owner = owner;
        this.balance = initialBalance;
    }

    // ===== PLAYER REGIONS BELOW =====

    public void deposit(double amount) {
        // YOUR CODE HERE
    }

    public void withdraw(double amount) {
        // YOUR CODE HERE
    }

    public double getBalance() {
        // YOUR CODE HERE
    }

    public String toString() {
        // YOUR CODE HERE
    }
}`,
    coderTasks: [
      {
        method: 'deposit(double amount)',
        rules: [
          'Add `amount` to `balance`',
          'If amount <= 0, throw IllegalArgumentException',
          'Do not modify any other method'
        ],
        hint: 'Think about validation first.'
      },
      {
        method: 'getBalance() and toString()',
        rules: [
          'getBalance() returns the current balance',
          'toString() returns "[owner]: $[balance]"',
          'Do not modify any other method'
        ],
        hint: 'Use String.format() for clean formatting.'
      }
    ],
    spyTask: {
      method: 'withdraw(double amount)',
      sabotage: 'Make withdraw() ADD to balance instead of subtract, OR skip validation so negative withdrawals are allowed.',
      cover: 'Your code must LOOK correct at a glance. Avoid obvious errors. Be subtle.'
    },
    tests: [
      { desc: 'deposit(100) increases balance by 100' },
      { desc: 'deposit(-50) throws exception' },
      { desc: 'withdraw(50) decreases balance by 50' },
      { desc: 'withdraw beyond balance throws exception' },
      { desc: 'toString() returns correct format' }
    ]
  }
};

function getScenario(name) {
  return scenarios[name] || scenarios['bank'];
}

function listScenarios() {
  return Object.entries(scenarios).map(([key, val]) => ({
    key,
    name: val.name,
    description: val.description,
    language: val.language
  }));
}

module.exports = { getScenario, listScenarios };