'use strict';

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);
const assert = chai.assert;
const evaluator = require('../index');
const _ = require('lodash');
const moment = require('moment');

const TOTAL_TEST_CASE = 13;

const getTestCase = (data, type) => {
    let result = _.cloneDeep(data);

    result.description = type.toUpperCase() + " " + result.description;

    result.plan.type = type;


    if (result.quotes["_" + type]) {
        result.quotes = result.quotes["_" + type];
    } else {
        if (type === "short") {
            result.quotes = _.reverse(result.quotes)
        }
    }

    result.plan.entry = result.plan.prices[0];
    if (type === "short") {
        result.plan.target = result.plan.prices[2];
        result.plan.stopLoss = result.plan.prices[1];
    } else {
        result.plan.target = result.plan.prices[1];
        result.plan.stopLoss = result.plan.prices[2];
    }
    delete result.plan.prices;

    result.check = _.merge(result.check, result.check["_" + type]);
    delete result.check._long;
    delete result.check._short;

    return result;
};

describe('trading-plan-evaluator', () => {
    _.each(_.times(TOTAL_TEST_CASE), (index) => {

        const testCase = require("./test-" + (index + 1));
        const cases = [getTestCase(testCase, "long"), getTestCase(testCase, "short")];
        _.each(cases, (data) => {
            it(`should evaluate case ${data.description} correctly`, () => {
                console.log("-------------------------------------------------");
                console.log(" Test case:", data.description);
                console.log("-------------------------------------------------");
                let plan = data.plan;
                _.each(data.quotes, (quote, i) => {
                    console.log('-->\t' + JSON.stringify(plan) + '\n\t' + JSON.stringify(quote)+"\n");
                    let result = evaluator.evaluate(plan, quote);
                    plan = result.plan;
                    console.log('<--\t' + JSON.stringify(plan)+ '\n\tOrders: ' +JSON.stringify(result.orders)+"\n");
                    assert.equal(plan.status, data.status[i]);
                });
                if (data.check.stopLoss)
                    assert.equal(data.check.stopLoss, !_.isNull(plan.executedStopLoss));
                if (testCase.check.target)
                    assert.equal(data.check.target, !_.isNull(plan.executedTarget));

                if (data.check.executedEntry)
                    assert.equal(data.check.executedEntry, plan.executedEntry);
                if (data.check.executedStopLoss)
                    assert.equal(data.check.executedStopLoss, plan.executedStopLoss);
                if (data.check.executedTarget)
                    assert.equal(data.check.executedTarget, plan.executedTarget);
            });
        });
    })
});