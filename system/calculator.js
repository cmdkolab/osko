class SafeCalculator {
    constructor() {
        this.allowedFunctions = ["add", "subtract", "multiply", "divide"];
    }

    add(a, b) {
        return a + b;
    }

    subtract(a, b) {
        return a - b;
    }

    multiply(a, b) {
        return a * b;
    }

    divide(a, b) {
        if (b === 0) throw new Error("Cannot divide by zero.");
        return a / b;
    }

    evaluate(expression) {
        const regex = /\b(\w+)\b/;
        const match = regex.exec(expression);

        if (match && this.allowedFunctions.includes(match[0])) {
            const fn = this[match[0]];
            const args = expression.replace(regex, '').split(',').map(Number);
            return fn.apply(this, args);
        }
        throw new Error("Invalid function or expression.");
    }
}

// Example usage:
// const calculator = new SafeCalculator();
// console.log(calculator.evaluate('add(1, 2)')); // Outputs: 3
// console.log(calculator.evaluate('divide(4, 0)')); // Throws error
