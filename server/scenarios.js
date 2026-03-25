const TASKS = {
  constructorValidation: {
    id: 'constructorValidation',
    title: 'Validate constructor inputs',
    method: 'BankAccount(String owner, double initialBalance)',
    dependsOn: [],
    rules: [
      'If owner is null or blank, throw IllegalArgumentException',
      'If initialBalance is negative, throw IllegalArgumentException',
      'Initialize owner and balance correctly'
    ],
    hint: 'Validate owner first, then initialBalance.',
    visibleTests: [
      { id: 'ctor-owner', desc: 'constructor rejects blank owner' },
      { id: 'ctor-balance', desc: 'constructor rejects negative balance' }
    ],
    hiddenTests: [
      { id: 'ctor-valid', desc: 'constructor stores valid owner and balance' }
    ],
    editableRange: {
      start: '// TASK: constructorValidation:start',
      end: '// TASK: constructorValidation:end'
    }
  },

  depositCore: {
    id: 'depositCore',
    title: 'Implement deposit',
    method: 'deposit(double amount)',
    dependsOn: ['constructorValidation'],
    rules: [
      'If amount <= 0, throw IllegalArgumentException',
      'Add amount to balance'
    ],
    hint: 'Validate amount before updating balance.',
    visibleTests: [
      { id: 'deposit-add', desc: 'deposit(100) increases balance by 100' },
      { id: 'deposit-invalid', desc: 'deposit(-10) throws exception' }
    ],
    hiddenTests: [
      { id: 'deposit-zero', desc: 'deposit(0) throws exception' }
    ],
    editableRange: {
      start: '// TASK: depositCore:start',
      end: '// TASK: depositCore:end'
    }
  },

  withdrawCore: {
    id: 'withdrawCore',
    title: 'Implement withdraw',
    method: 'withdraw(double amount)',
    dependsOn: ['constructorValidation'],
    rules: [
      'If amount <= 0, throw IllegalArgumentException',
      'If amount > balance, throw IllegalStateException',
      'Subtract amount from balance'
    ],
    hint: 'Validate amount and overdraft before subtracting.',
    visibleTests: [
      { id: 'withdraw-subtract', desc: 'withdraw(50) decreases balance by 50' },
      { id: 'withdraw-overdraft', desc: 'withdraw beyond balance throws exception' }
    ],
    hiddenTests: [
      { id: 'withdraw-invalid', desc: 'withdraw(0) throws exception' }
    ],
    editableRange: {
      start: '// TASK: withdrawCore:start',
      end: '// TASK: withdrawCore:end'
    }
  },

  getBalanceTask: {
    id: 'getBalanceTask',
    title: 'Return balance',
    method: 'getBalance()',
    dependsOn: ['constructorValidation'],
    rules: [
      'Return the current balance'
    ],
    hint: 'Just return the field.',
    visibleTests: [
      { id: 'balance-return', desc: 'getBalance() returns current balance' }
    ],
    hiddenTests: [],
    editableRange: {
      start: '// TASK: getBalanceTask:start',
      end: '// TASK: getBalanceTask:end'
    }
  },

  buildSummaryTask: {
    id: 'buildSummaryTask',
    title: 'Format summary string',
    method: 'toString()',
    dependsOn: ['getBalanceTask'],
    rules: [
      'Return "[owner]: $[balance]"',
      'Use two decimal places'
    ],
    hint: 'Use String.format("%s: $%.2f", owner, balance)',
    visibleTests: [
      { id: 'toString-format', desc: 'toString() returns correct format' }
    ],
    hiddenTests: [],
    editableRange: {
      start: '// TASK: buildSummaryTask:start',
      end: '// TASK: buildSummaryTask:end'
    }
  },

  spyWithdrawSabotage: {
    id: 'spyWithdrawSabotage',
    title: 'Quietly sabotage withdraw',
    method: 'withdraw(double amount)',
    dependsOn: ['constructorValidation'],
    sabotage: 'Make withdraw look normal but fail one hidden expectation.',
    cover: 'Keep the method readable and believable.',
    visibleTests: [
      { id: 'withdraw-subtract', desc: 'withdraw(50) decreases balance by 50' }
    ],
    hiddenTests: [
      { id: 'spy-hidden', desc: 'Hidden integration trap' }
    ],
    editableRange: {
      start: '// TASK: withdrawCore:start',
      end: '// TASK: withdrawCore:end'
    }
  }
};

const sharedCodeTemplate = `public class BankAccount {
    private String owner;
    private double balance;

    // TASK: constructorValidation:start
    public BankAccount(String owner, double initialBalance) {
        this.owner = owner;
        this.balance = initialBalance;
    }
    // TASK: constructorValidation:end

    // TASK: depositCore:start
    public void deposit(double amount) {
        // TODO
    }
    // TASK: depositCore:end

    // TASK: withdrawCore:start
    public void withdraw(double amount) {
        // TODO
    }
    // TASK: withdrawCore:end

    // TASK: getBalanceTask:start
    public double getBalance() {
        // TODO
        return 0;
    }
    // TASK: getBalanceTask:end

    // TASK: buildSummaryTask:start
    @Override
    public String toString() {
        // TODO
        return "";
    }
    // TASK: buildSummaryTask:end
}
`;

function buildRoomPlan(playerCount) {
  if (playerCount === 4) {
    return {
      coderQueues: [
        ['constructorValidation', 'buildSummaryTask'],
        ['depositCore'],
        ['withdrawCore'],
      ],
      spyQueue: ['getBalanceTask']
    };
  }

  if (playerCount === 5) {
    return {
      coderQueues: [
        ['constructorValidation'],
        ['depositCore'],
        ['withdrawCore'],
        ['buildSummaryTask']
      ],
      spyQueue: ['getBalanceTask']
    };
  }

  return {
    coderQueues: [
      ['constructorValidation'],
      ['depositCore'],
      ['withdrawCore'],
      ['getBalanceTask'],
      ['buildSummaryTask']
    ],
    spyQueue: []
  };
}

const scenarios = {
  bank: {
    key: 'bank',
    name: 'Bank Job',
    language: 'java',
    description: 'Implement a collaborative BankAccount class',
    sharedCodeTemplate,
    tasks: TASKS,
    roomPlanBuilder: buildRoomPlan,
    finalSuite: [
      { id: 'ctor-owner', desc: 'constructor rejects blank owner' },
      { id: 'ctor-balance', desc: 'constructor rejects negative balance' },
      { id: 'deposit-add', desc: 'deposit(100) increases balance by 100' },
      { id: 'deposit-invalid', desc: 'deposit(-10) throws exception' },
      { id: 'withdraw-subtract', desc: 'withdraw(50) decreases balance by 50' },
      { id: 'withdraw-overdraft', desc: 'withdraw beyond balance throws exception' },
      { id: 'balance-return', desc: 'getBalance() returns current balance' },
      { id: 'toString-format', desc: 'toString() returns correct format' }
    ]
  }
};

function getScenario(name) {
  return scenarios[name] || scenarios.bank;
}

function listScenarios() {
  return Object.values(scenarios).map((scenario) => ({
    key: scenario.key,
    name: scenario.name,
    description: scenario.description,
    language: scenario.language
  }));
}

module.exports = {
  getScenario,
  listScenarios
};