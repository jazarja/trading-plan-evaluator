'use strict';

const moment = require('moment');
const Promise = require('bluebird');
const _ = require('lodash');
const expr = require('expression-eval');

const PLAN_LONG = "long";
const PLAN_SHORT = "short";

const ACTION_BUY = "buy";
const ACTION_SELL = "sell";

const STATUS_WAITING = "waiting";
const STATUS_IN_PROGRESS = "in-progress";
const STATUS_COMPLETED = "completed";

const QUOTE_DAILY = "daily";
const QUOTE_INTRADAY = "intraday";
const QUOTE_REALTIME = "realtime";

const debug = require('debug')('trading_plan_evaluator');

const inRange = (a, low, high) => {
    return a >= low && a <= high;
};

const isGapUp = (a, low, high) => {
    return low > a && high > a && low < high;
};

const isGapDown = (a, low, high) => {
    return low < a && high < a && low < high;
};

const isOpenablePrice = (plan, quote) => {
    if (quote.type === QUOTE_DAILY) {
        return inRange(plan.entry, quote.low, quote.high) ||
            // Gaps
            (plan.type === PLAN_LONG && isGapDown(plan.entry, quote.low, quote.high)) ||
            (plan.type === PLAN_SHORT && isGapUp(plan.entry, quote.low, quote.high))
            ;
    } else if (quote.type === QUOTE_INTRADAY) {
        return (plan.type === PLAN_LONG && quote.last <= plan.entry) ||
            (plan.type === PLAN_SHORT && quote.last >= plan.entry)
    } else if (quote.type === QUOTE_REALTIME) {
        return (plan.type === PLAN_LONG && quote.ask <= plan.entry) ||
            (plan.type === PLAN_SHORT && quote.bid >= plan.entry)
    }
};

const isClosablePrice = (plan, quote) => {
    if (quote.type === QUOTE_DAILY) {
        return (
            inRange(plan.target, quote.low, quote.high) ||
            // Gaps
            (plan.type === PLAN_LONG && isGapUp(plan.target, quote.low, quote.high)) ||
            (plan.type === PLAN_SHORT && isGapDown(plan.target, quote.low, quote.high))
        )
    } else if (quote.type === QUOTE_INTRADAY) {
        return (
            // In range
            (plan.type === PLAN_LONG && (quote.last - plan.target > 0)) ||
            (plan.type === PLAN_SHORT && (quote.last - plan.target < 0))
        );

    } else if (quote.type === QUOTE_REALTIME) {
        return (
            // In range
            (plan.type === PLAN_LONG && (quote.bid - plan.target >= 0)) ||
            (plan.type === PLAN_SHORT && (quote.bid - plan.target <= 0))
        );

    }
};

const isStopLossRequiredPrice = (plan, quote) => {
    if (quote.type === QUOTE_DAILY) {
        return inRange(plan.stopLoss, quote.low, quote.high) ||
            // Gaps
            (plan.type === PLAN_LONG && isGapDown(plan.stopLoss, quote.low, quote.high)) ||
            (plan.type === PLAN_SHORT && isGapUp(plan.stopLoss, quote.low, quote.high))
            ;
    } else if (quote.type === QUOTE_INTRADAY) {
        return (
            // In range
            (plan.type === PLAN_LONG && (quote.last - plan.stopLoss < 0)) ||
            (plan.type === PLAN_SHORT && (quote.last - plan.stopLoss > 0))
        );

    } else if (quote.type === QUOTE_REALTIME) {
        return (
            // In range
            (plan.type === PLAN_LONG && (quote.ask - plan.stopLoss <= 0)) ||
            (plan.type === PLAN_SHORT && (quote.bid - plan.stopLoss >= 0))
        );

    }
};

const getPriceFromQuote = (quote) => {
    if (quote.type === QUOTE_INTRADAY)
        return quote.last;
    if (quote.type === QUOTE_DAILY)
        return quote.close;
    if (quote.type === QUOTE_REALTIME)
        return quote.last;
};

const getPayload = (quote) => {
    return _.merge(quote, { "price" : getPriceFromQuote(quote) });
};

const evaluateExpression = (expression, quote) => {
    const ast = expr.parse(expression);
    return expr.eval(ast, getPayload(quote));
};

const isOpenable = (plan, quote) => {
    if (isNaN(plan.entry)) {
        return evaluateExpression(plan.entry, quote);
    } else
        return isOpenablePrice(plan, quote);
};

const isClosable = (plan, quote) => {
    if (isNaN(plan.target)) {
        return evaluateExpression(plan.target, quote);
    } else
        return isClosablePrice(plan, quote);
};

const isStopLossRequired = (plan, quote) => {
    if (isNaN(plan.stopLoss)) {
        return evaluateExpression(plan.stopLoss, quote);
    } else
        return isStopLossRequiredPrice(plan, quote);
};

module.exports.evaluate = (plan, quote) => {
    debug("Plan:", JSON.stringify(plan));
    debug("Quote:", JSON.stringify(quote));
    let orders = [];

    if (plan.status === STATUS_WAITING) {
        const openable = isOpenable(plan, quote);
        debug("Openable:", openable);
        if (openable) {
            plan.status = STATUS_IN_PROGRESS;
            if (isNaN(plan.entry))
            {
                // Assume execution on current price
                plan.executedEntry = getPriceFromQuote(quote);
            } else {
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_LONG && isGapDown(plan.entry, quote.low, quote.high))
                    plan.executedEntry = quote.high; else
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_LONG)
                    plan.executedEntry = Math.max(plan.entry, quote.low); else
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_SHORT && isGapUp(plan.entry, quote.low, quote.high))
                    plan.executedEntry = quote.low; else
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_SHORT)
                    plan.executedEntry = Math.min(plan.entry, quote.high); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_LONG)
                    plan.executedEntry = Math.max(plan.entry, quote.last); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_SHORT)
                    plan.executedEntry = Math.min(plan.entry, quote.last); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_LONG)
                    plan.executedEntry = Math.max(plan.entry, quote.ask); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_SHORT)
                    plan.executedEntry = Math.min(plan.entry, quote.bid);
            }

            orders.push({
                price: plan.executedEntry,
                symbol : plan.symbol,
                action: plan.type === PLAN_LONG ? ACTION_BUY : ACTION_SELL
            });
        }
        return { plan, orders };
    } else if (plan.status === STATUS_IN_PROGRESS) {
        const closable = isClosable(plan, quote);
        debug("Closable:", closable);
        const stopLossRequired = plan.stopLoss ?
            isStopLossRequired(plan, quote) : false;
        debug("Stop Loss:", stopLossRequired);

        if (closable) {
            plan.status = STATUS_COMPLETED;
            if (isNaN(plan.target))
            {
                // Assume execution on current price
                plan.executedTarget = getPriceFromQuote(quote);
            } else {
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_LONG)
                    plan.executedTarget = Math.max(plan.target, quote.low); else
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_SHORT)
                    plan.executedTarget = Math.min(plan.target, quote.high); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_LONG)
                    plan.executedTarget = Math.max(plan.target, quote.last); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_SHORT)
                    plan.executedTarget = Math.min(plan.target, quote.last); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_LONG)
                    plan.executedTarget = Math.max(plan.target, quote.bid); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_SHORT)
                    plan.executedTarget = Math.min(plan.target, quote.ask);
            }
            orders.push({
                price: plan.executedTarget,
                symbol : plan.symbol,
                action: plan.type === PLAN_LONG ? ACTION_SELL : ACTION_BUY
            });
            return { plan, orders };
        }
        if (stopLossRequired) {
            plan.status = STATUS_COMPLETED;
            if (isNaN(plan.stopLoss))
            {
                // Assume execution on current price
                plan.executedStopLoss = getPriceFromQuote(quote);
            } else {
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_LONG)
                    plan.executedStopLoss = Math.max(plan.stopLoss, quote.low); else
                if (quote.type === QUOTE_DAILY && plan.type === PLAN_SHORT)
                    plan.executedStopLoss = Math.min(plan.stopLoss, quote.high); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_LONG)
                    plan.executedStopLoss = Math.max(plan.stopLoss, quote.last); else
                if (quote.type === QUOTE_INTRADAY && plan.type === PLAN_SHORT)
                    plan.executedStopLoss = Math.min(plan.stopLoss, quote.last); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_LONG)
                    plan.executedStopLoss = Math.min(plan.stopLoss, quote.bid); else
                if (quote.type === QUOTE_REALTIME && plan.type === PLAN_SHORT)
                    plan.executedStopLoss = Math.max(plan.stopLoss, quote.ask);
            }
            orders.push({
                price: plan.executedTarget,
                symbol : plan.symbol,
                action: plan.type === PLAN_LONG ? ACTION_SELL : ACTION_BUY
            });
            return { plan, orders };
        }

        // Do nothing
        return { plan };
    } else {
        console.error("Unable to evaluate plan. Plan status is not waiting or in progress");
        return { plan };
    }
};