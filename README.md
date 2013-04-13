Cubico
======

cubico.js – a simple OLAP engine for the browser

### Instantiate
```JavaScript
var cubico = new Cubico();
```

### Populate
```JavaScript
var data = [{age: 41, country: "Argentina", income: 43200}, ...];
for (var i=0; i < data.length; i++) {
    cubico.addRecord(data[i]);
}
```
This method automatically creates the dimensions for you, and assumes that all the values are measures. With these data we can already perform some simple computations:
```JavaScript
cubico.stdDev("age");
cubico.sum("income");
cubico.covariance("age", "income");
```

### Filter, then get some data
We can easily filter our data using the built-in filters. It is as simple as:
```JavaScript
cubico.slice({country: "Argentina"}).average("income");
```

Or it can be more complex:
```JavaScript
var criteria = [["country", "=", "Argentina"], ["age", ">", 35],  ["age", "<", 50], ["income", ">", 20000]];
cubico.slice(criteria).average("income");
```

### Built-in filters
Cubico has built in filters. To use them, you have to input a triplet in the form of an array, where the first element is the dimension name, the second is the comparison and the third the value you want to compare against.
For example, let's get all those persons that are over 21 years and earn more than $15000:
```JavaScript
cubico.slice([["age", ">", 21], ["income", ">", 15000]]);
```

The built-in filters are `=`, `!=`, `<`, `<=`, `>` and `>=`.
You can pass on as many filters as you want, in the form of triplets for the built-in functions or the ones that you can build yourself.
Method	Description
`["age", ">", 2]`	Sum all the values of a dimension for each group
`["income", "<", 10000]`	Sum all the values of a dimension for each group

### Custom filters
Instead of a triplet, provide a function like this one:

```JavaScript
(function (c) {
    var dim1 = c.getDimensionIndex("price");
    var dim2 = c.getDimensionIndex("cost");
    return function(record) {
        // only those records with a margin above 10%
        return (record[dim1] - record[dim2]) / record[dim2] > 0.1
    };
})(cubico);
````
As you may have noticed, the record is provided as plain array (because it's faster that way!), so Cubico provides a handy function for translating a dimension to an index, and that's way you have to provide the indexes within a closure.

You can provide any number of filters, the only requirement is that they accept the record they are going to evaluate, and then they return true if the record is acceptable or false otherwise.

### Built-in aggregations
Cubico has built in filters. To use them, you have to input a triplet in the form of an array, where the first element is the dimension name, the second is the comparison and the third the value you want to compare against.

Method	Description
["age", ">", 2]	Sum all the values of a dimension for each group
["income", "<", 10000]	Sum all the values of a dimension for each group


### Custom aggregations
Instead of using the built-in aggregations, or in addition to them, Cubico let's users provide their own aggregations:
```JavaScript
(function (c) {
    var dim1 = c.getDimensionIndex("price");
    var dim2 = c.getDimensionIndex("cost");
    // just sum the difference between price and group by group
    return function(record, staticVars) {
        if (!staticVars.init) {
          // initialize static vars
          staticVars.count = 0;
          staticVars.total = 0;
        }
        staticVars.count++;
        staticVars.total += record[dim1] - record[dim2];
        return staticVars.total / staticVars.count;
    };
})(cubico);
```

