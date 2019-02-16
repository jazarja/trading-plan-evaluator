Trading Plan Evaluator
=======================

A small library that can be used to evaluate trading plan against daily/intraday/realtime market quote.

## Installation

  `npm install trading-plan-evaluator`
  
## Sample Data

1. Trading Plan 

```
{
    "symbol": "ACME",
    "type": "long",
    "status": "waiting",
    "entry": 1000,
    "stopLoss": 800,
    "target": 1200
}  
```

2. Daily Quote 

```
{
      "type": "daily",
      "low": 1050,
      "close" : 1100,
      "high": 1250,
      "open" : 900,
      "volume" : 10000
}  
```

3. Intraday Quote

```
{
      "type": "intraday",
      "low": 1050,
      "last" : 1100,
      "high": 1250,
      "open" : 900,
      "volume" : 10000
}  
```

4. Realtime Quote

```
{
      "type": "realtime",
      "low": 1050,
      "last" : 1100,
      "high": 1250,
      "bid": 1075,
      "ask" : 1100,
      "volume" : 10000
}  
```


## Usage

```
    const evaluator = require('trading-plan-evaluator');
    let result = evaluator.evaluate(plan, quote); 
    let updatedPlan = result.plan;
    let orders = result.orders;
```    

## Tests

  `npm test`

## Contributing

In lieu of a formal style guide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code.