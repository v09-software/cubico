/**
 * Copyright (c) 2013 Diego I. Dayan
 * http://github.com/diegodayan/cubico
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/**
 * A simple cube that can handle an arbitrary number of dimensions
 * Implements filtering (via the use of slice) and aggregation functions
 * such as sum, avg, std dev, min, max, first, last, uppercase, etc...
 *
 * TODO how to handle nulls?
 * TODO unit testing
 * TODO add references to aggregated records so we can drill down
 *
 * @author Diego Dayan
 * @version 0.1
 * @constructor
 */
function Cubico() {
    /**
     * The number of dimensions in this Cubico
     * Should be equal to this.dimensions.length
     * @type {Number}
     */
    this.nbrOfDimensions = 0;
    /**
     * The number of records in this Cubico
     * Should be equal to this.storage.length
     * @type {Number}
     */
    this.nbrOfRecords = 0;
    /**
     * The array that contains the references to
     * every record in this Cubico
     * @type {Array}
     */
    this.storage = [];
    /**
     *
     * @type {Object}
     */
    this.storageMap = {};
    /**
     * A HashMap where keys are the dimension names
     * and values are the dimension objects
     * @type {Object}
     */
    this.dimensions = [];
    /**
     * A HashMap where keys are the dimension names
     * and values are the dimension objects
     * @type {Object}
     */
    this.dimensionMap = {};
}

/**
 *
 * @param name
 * @param dataType
 * @constructor
 */
function CubicoDimension(name, dataType) {
    if (dataType !== Cubico.TEXT && dataType !== Cubico.NUMERIC)
        throw new Error("DataType is not valid");

    this.name = name;
    this.dataType = dataType;
    this.summation = 0;
    this.summationOfSquares = 0;
    this.countUnique = 0;
    this.countUnique = 0;
    this.stdDev = null; // initialize null because we might never compute it, but if we do we will know because of this
    this.max = Number.NEGATIVE_INFINITY;
    this.min = Number.POSITIVE_INFINITY;
    this.valuesMap = {};
    this.valuesMapSize = 0;
    this.index = -1;
}

/**
 * @const
 * @type {Number}
 */
Cubico.NUMERIC = 1;
/**
 * @const
 * @type {Number}
 */
Cubico.TEXT = 2;
/**
 * @const
 * @type {Number}
 */
Cubico.NULL = 9;

/**
 * Returns a pseudo-hash identifying the group of the record
 * according to the user-selected dimensions (indexes)
 *
 * @param {Array} record
 * @param {Array} indexes
 * @return {String}
 */
Cubico.getHashCode = function (record, indexes) {
    var hash = "";
    for (var i = indexes.length - 1; i > -1; i--) {
        hash += record[indexes[i]].toString() + "_7";
    }
    return hash;
};

/**
 * Checks if a record complies with the criteria
 *
 * @param {Array} record
 * @param {Array} validCriteria
 * @return {Boolean}
 */
Cubico.recordMatchesCriteria = function (record, validCriteria) {
    for (var i = 0; i < validCriteria.length; i++) {
        if (!validCriteria[i](record))
            return false;
    }
    return true;
};

/**
 *
 * @param {String} name
 * @param {Number} dataType
 */
Cubico.prototype.addDimension = function (name, dataType) {
    if (this.dimensionMap.hasOwnProperty(name))
        throw new Error("Dimension names must be unique");

    // create the new dimension
    this.dimensions.push(new CubicoDimension(name, dataType));
    this.dimensions[this.nbrOfDimensions].index = this.nbrOfDimensions;

    // add it to the HashMap
    this.dimensionMap[name] = this.dimensions[this.nbrOfDimensions];

    // obviously
    this.nbrOfDimensions++;

    // populate records with the new value
    for (var i = 0; i < this.nbrOfRecords; i++) {
        this.storage[i].push(null);
    }
};

/**
 * @param {String} dimension
 * @return {Boolean}
 */
Cubico.prototype.hasDimension = function (dimension) {
    return this.dimensionMap.hasOwnProperty(dimension);
};

/**
 * @param {String} dimensionName
 * @return {Number}
 */
Cubico.prototype.getDimensionIndex = function (dimensionName) {
    this.assertDimension(dimensionName);
    return this.dimensionMap[dimensionName].index;
};

/**
 *
 * @param record
 */
Cubico.prototype.accumulateRecordValues = function (record) {
    var value;

    for (var i = 0; i < this.nbrOfDimensions; i++) {

        value = record[i];

        // skip if null or undefined (weak equality)
        if (value == null)
            continue;

        // increment count
        this.dimensions[i].countUnique++; // S0

        if (!this.dimensions[i].valuesMap.hasOwnProperty(value)) {
            this.dimensions[i].valuesMap[value.toString()] = [];
            this.dimensions[i].valuesMapSize++;
        }

        // store reference to the record in valuesMap
        this.dimensions[i].valuesMap[value.toString()].push(record);

        if (this.dimensions[i].dataType === Cubico.NUMERIC) {
            this.dimensions[i].summation += value; // S1
            this.dimensions[i].summationOfSquares += Math.pow(value, 2); // S2
            this.dimensions[i].max = Math.max(this.dimensions[i].max, value);
            this.dimensions[i].min = Math.min(this.dimensions[i].min, value);
        }
    }
};

Cubico.prototype.addRecordFromArray = function (record, makeCopy) {
    if (!record instanceof  Array)
        throw new Error("Record is not an array");

    if (record.length !== this.nbrOfDimensions)
        throw new Error("Record has " + (record.length > this.nbrOfDimensions ? "higher" : "lower") + " dimensionality than expected");

    // push a copy or a reference
    if (makeCopy === false) // use same reference
        this.storage.push(record);
    else // copy entire record
        this.storage.push(record.slice(0));

    this.accumulateRecordValues(this.storage[this.nbrOfRecords]);
    this.nbrOfRecords++;

    return this;
};

Cubico.prototype.addRecordFromObject = function (record) {
    if (typeof record !== "object")
        throw new Error("Record is not an object");

    // create new empty record
    var newRecord = new Array(this.nbrOfDimensions);
    var i = newRecord.length;
    while (i > 0) newRecord[--i] = null;

    // populate values and add it to storage
    for (var attr in record) {
        if (record.hasOwnProperty(attr)) {
            if (this.hasDimension(attr) === false) {
                // create new dimension
                isNaN(record[attr])
                    ? this.addDimension(attr, Cubico.TEXT)
                    : this.addDimension(attr, Cubico.NUMERIC);
            }
            i = this.dimensionMap[attr].index;
            newRecord[i] = record[attr];
        }
    }

    // add new record
    return this.addRecordFromArray(newRecord, false);
};

Cubico.prototype.addRecord = function (record) {
    if (record instanceof Array)
        return this.addRecordFromArray(record);
    else if (typeof record === "object")
        return this.addRecordFromObject(record);
    else
        throw new Error("Record has to be an array or an object only");
};

/**
 * Returns an slice of the Cubico matching the given criteria
 * @param criteria
 */
Cubico.prototype.slice = function (criteria) {
    // if criteria is in the object form: {dimensionX: valueX, dimensionY: valueY},
    // transform it to the Array form
    if (!criteria instanceof Array && typeof criteria === "object") {
        var temp = criteria;
        criteria = [];
        for (var attr in temp) {
            if (temp.hasOwnProperty(attr)) {
                criteria.push([attr, "=", temp[attr]]);
            }
        }
    }

    // check if Array before we start iteration
    if (!criteria instanceof Array)
        throw new Error("Criteria should be an Array");

    // to keep track of the index with the least records
    // this helps to speed-up creation of a new Cubico
    // because we will iterate through a smaller subset of records
    var smallerCount = Number.POSITIVE_INFINITY;
    var smallerIndex = -1;
    var smallerIndexKey = null;
    var criterion;

    // validate criteria and transform dimension names to dimension indexes
    for (var i = 0; i < criteria.length; i++) {

        /**
         * A criterion is a 3-element array being:
         * (0) dimension name, (1) operator [=|<|>|...], (2) pattern
         * @type {Array}
         */
        criterion = criteria[i];

        if (criterion instanceof Function === false) {
            // validate criteria
            if (criterion instanceof Array === false)
                throw new Error("Criterion at index " + i + " is not an Array");
            if (criterion.length !== 3)
                throw new Error("Criterion at index " + i + " is bad formed");
            if (!this.hasDimension(criterion[0]))
                throw new Error("Dimension " + criterion[0] + " does not exist (criterion at index " + i + ")");
            if (["=", ">", "<", ">=", "<=", "!="].indexOf(criterion[1]) === -1)
                throw new Error("Not a valid operator provided: " + criterion[1] + " (criterion at index " + i + ")");

            // transform dimensionName into dimensionIndex
            criterion[0] = this.dimensionMap[criterion[0]].index;

            // if possible, find a smaller subset of records so the following iteration is faster
            if (criterion[1] === "=") {
                if (this.dimensions[criterion[0]].valuesMap.hasOwnProperty(criterion[2])) {
                    if (this.dimensions[criterion[0]].valuesMap[criterion[2]].length < smallerCount) {
                        smallerCount = this.dimensions[criterion[0]].valuesMap[criterion[2]].length;
                        smallerIndex = criterion[0];
                        smallerIndexKey = criterion[2];
                    }
                }
            }

            criteria[i] = this.getFilter(criterion[1], criterion[0], criterion[2]);
        }
    }

    // instantiate new Cubico
    var cubico = this.cloneWithoutStorage();

    // if we found an index with less values then use it
    var storage = smallerIndex > -1
        ? this.dimensions[smallerIndex].valuesMap[smallerIndexKey]
        : this.storage;

    // populate new Cubico
    for (i = 0; i < storage.length; i++) {
        if (Cubico.recordMatchesCriteria(storage[i], criteria)) {
            cubico.addRecordFromArray(storage[i], false);
        }
    }

    // done
    return cubico;
};

/**
 *
 * @param dimension
 * @return {Number}
 */
Cubico.prototype.sum = function (dimension) {
    this.assertNumericDimension(dimension);
    return this.dimensionMap[dimension].summation;
};

/**
 *
 * @param {String} dimension
 * @return {Number}
 */
Cubico.prototype.sumOfSquares = function (dimension) {
    this.assertNumericDimension(dimension);
    return this.dimensionMap[dimension].summationOfSquares;
};

/**
 *
 * @param {String} dimension
 * @return {Number}
 */
Cubico.prototype.countUnique = function (dimension) {
    this.assertDimension(dimension);
    return this.dimensionMap[dimension].countUnique;
};

/**
 *
 * @param {String} dimension
 * @return {Number}
 */
Cubico.prototype.countUnique = function (dimension) {
    this.assertDimension(dimension);
    return this.dimensionMap[dimension].valuesMapSize;
};

/**
 *
 * @param {String} dimension
 * @return {Number}
 */
Cubico.prototype.average = function (dimension) {
    this.assertNumericDimension(dimension);
    return this.dimensionMap[dimension].countUnique > 0
        ? this.dimensionMap[dimension].summation / this.dimensionMap[dimension].countUnique
        : 0;
};

/**
 *
 * @param dimension
 * @param approximate
 * @return {Number}
 */
Cubico.prototype.stdDev = function (dimension, approximate) {
    this.assertNumericDimension(dimension);
    var count = this.countUnique(dimension);

    // is this valid?
    if (count === 0)
        return 0;

    // approximation sqrt(s0 * s2 - s1^2) / s0
    if (approximate === true)
        return Math.sqrt(count * this.sumOfSquares(dimension) - Math.pow(this.sum(dimension), 2)) / count;

    // check if we have already computed the std. dev.
    if (this.dimensionMap[dimension].stdDev !== null)
        return this.dimensionMap[dimension].stdDev;

    // the user wants the real std dev, so let's compute it
    var average = this.average(dimension);
    var dimIdx = this.dimensionMap[dimension].index;
    var stdDev = 0;
    for (var i = 0; i < this.nbrOfRecords; i++) {
        stdDev += Math.pow(this.storage[i][dimIdx] - average, 2);
    }

    // store the result so we don't compute the same thing twice
    this.dimensionMap[dimension].stdDev = Math.sqrt(stdDev / count);

    // done!
    return this.dimensionMap[dimension].stdDev;
};

/**
 *
 * @param dimension
 * @param approximate
 * @returns {Number}
 */
Cubico.prototype.variance = function (dimension, approximate) {
    this.assertNumericDimension(dimension);
    return Math.pow(this.stdDev(dimension, approximate), 2);
};

/**
 *
 * @param dimension
 * @return {Number}
 */
Cubico.prototype.min = function (dimension) {
    this.assertNumericDimension(dimension);
    return this.dimensionMap[dimension].min;
};

/**
 *
 * @param dimension
 * @return {Number}
 */
Cubico.prototype.max = function (dimension) {
    this.assertNumericDimension(dimension);
    return this.dimensionMap[dimension].max;
};

/**
 *
 * @param dimension1
 * @param dimension2
 * @return {Number}
 */
Cubico.prototype.covariance = function (dimension1, dimension2) {
    this.assertNumericDimension(dimension1);
    this.assertNumericDimension(dimension2);

    var dim1 = this.dimensionMap[dimension1].index;
    var dim2 = this.dimensionMap[dimension2].index;

    var covariance = 0;
    var avg1 = this.average(dimension1);
    var avg2 = this.average(dimension2);

    for (var i = 0; i < this.nbrOfRecords; i++) {
        covariance += (this.storage[i][dim1] - avg1) * (this.storage[i][dim2] - avg2);
    }

    return covariance / Math.max(this.countUnique(dimension1), this.countUnique(dimension2));
};

Cubico.prototype.sumOf = function (dimension) {
    var dimIdx = this.getDimensionIndex(dimension);
    return function (record, staticVars) {
        if (!staticVars.runningTotal) {
            staticVars.runningTotal = 0;
        }
        if (record[dimIdx] !== null) {
            staticVars.runningTotal += parseFloat(record[dimIdx]);
        }
        return staticVars.runningTotal;
    };
};

Cubico.prototype.averageOf = function (dimensionName) {
    var dimIdx = this.getDimensionIndex(dimensionName);
    return function (record, staticVars) {
        if (!staticVars.runningTotal) {
            staticVars.count = 0;
            staticVars.runningTotal = 0;
        }
        if (record[dimIdx] !== null) {
            staticVars.count++;
            staticVars.runningTotal += parseFloat(record[dimIdx]);
        }
        return staticVars.runningTotal / staticVars.count;
    };
};

Cubico.prototype.countOf = function (dimension) {
    if (dimension == "*") {
        return function (record, staticVars) {
            if (!staticVars.count) {
                staticVars.count = 0;
            }
            staticVars.count++;
            return staticVars.count;
        };
    } else {
        var dimIdx = this.getDimensionIndex(dimension);
        return function (record, staticVars) {
            if (!staticVars.count) {
                staticVars.count = 0;
            }
            if (record[dimIdx] !== null) {
                staticVars.count++;
            }
            return staticVars.count;
        };
    }
};

Cubico.prototype.countUniqueOf = function (dimension) {
    var dimIdx = this.getDimensionIndex(dimension);
    return function (record, staticVars) {
        if (!staticVars.countUnique) {
            staticVars.countUnique = 0;
            staticVars.valuesMap = {};
        }
        if (!staticVars.valuesMap.hasOwnProperty(record[dimIdx])) {
            staticVars.valuesMap[record[dimIdx]] = true;
            staticVars.countUnique++;
        }
        return staticVars.countUnique;
    };
};

Cubico.prototype.getAggregation = function (aggregationName, dimensionName) {
    switch (aggregationName) {
        case "sum":
            return this.sumOf(dimensionName);
        case "count":
            return this.countOf(dimensionName);
        case "countUnique":
            return this.countUniqueOf(dimensionName);
        case "average":
            return this.averageOf(dimensionName);
        default:
            throw new Error("Unknown aggregation type: " + aggregationName);
    }
};

Cubico.prototype.aggregate = function (dimensions, measures) {
    if (typeof dimensions === "string")
        dimensions = [dimensions];

    if (!dimensions instanceof Array)
        throw new Error("First argument should be an array of dimensions");

    if (!measures instanceof Array)
        throw new Error("Second argument should be an array of measures");

    // create a brand new Cubico
    var cubico = new Cubico();

    // add dimensions
    for (var i = 0; i < dimensions.length; i++) {
        dimensions[i] = this.getDimensionIndex(dimensions[i]);
        cubico.addDimension(this.dimensions[dimensions[i]].name, this.dimensions[dimensions[i]].dataType);
    }

    // add aggregations
    var measureName;
    for (i = 0; i < measures.length; i++) {
        if (measures[i] instanceof Function) {
            measureName = "a_" + Math.random();
        } else {
            measureName = measures[i][0] + "_" + measures[i][1];
            measures[i] = this.getAggregation(measures[i][0], measures[i][1]);
        }
        cubico.addDimension(measureName, Cubico.NUMERIC);
    }

    // object used by every aggregation function to carry on results
    var statics = {};

    // number of dimensions and number of measures
    var nbrOfDimensions = dimensions.length;
    var nbrOfMeasures = measures.length;
    var storageMap = {};

    // now aggregate records into new Cubico
    for (i = 0; i < this.nbrOfRecords; i++) {

        // keep reference to original record
        var originalRecord = this.storage[i];

        // compute unique value for the given set of dimensions
        var uniqueKey = Cubico.getHashCode(originalRecord, dimensions);

        // if group is not created yet, initialize it
        if (storageMap.hasOwnProperty(uniqueKey) === false) {

            // initialize record
            var newRecord = new Array(nbrOfDimensions + nbrOfMeasures);

            for (var j = 0; j < nbrOfDimensions; j++) {
                newRecord[j] = originalRecord[dimensions[j]];
            }

            // store references to the aggregated record and its children
            storageMap[uniqueKey] = {
                record:newRecord, // reference to aggregated record
                children:[] // reference to children
            };

            // create room for static vars that are used by computation
            statics[uniqueKey] = new Array(nbrOfMeasures);
            for (j = 0; j < nbrOfMeasures; j++) {
                statics[uniqueKey][j] = {};
            }
        }

        // now we know which group the original record is in
        storageMap[uniqueKey].children.push(originalRecord);

        // update values for aggregated record
        var aggregatedRecord = storageMap[uniqueKey].record;
        var measurePosition = nbrOfDimensions;
        var staticVars = statics[uniqueKey];
        for (var measureIdx = 0; measureIdx < measures.length; measureIdx++) {
            aggregatedRecord[measurePosition++] = measures[measureIdx](originalRecord, staticVars[measureIdx]);
        }
    }

    // we're done with aggregations, so just add the new aggregated records to the new Cubico
    for (uniqueKey in storageMap) {
        if (storageMap.hasOwnProperty(uniqueKey)) {
            cubico.addRecordFromArray(storageMap[uniqueKey].record, false);
        }
    }

    // return the shiny new Cubico to the user
    return cubico;
};

/**
 * Make a deep copy of this Cubico but without data (dimensions only)
 *
 * @return {Cubico}
 */
Cubico.prototype.cloneWithoutStorage = function () {
    var cubico = new Cubico();
    for (var i = 0; i < this.nbrOfDimensions; i++) {
        cubico.addDimension(this.dimensions[i].name, this.dimensions[i].dataType);
    }
    return cubico;
};

/**
 * Make a deep copy of this Cubico
 *
 * @return {Cubico}
 */
Cubico.prototype.clone = function () {
    var cubico = this.cloneWithoutStorage();
    for (var i = 0; i < this.nbrOfRecords; i++) {
        cubico.addRecordFromArray(this.storage[i], true);
    }
    return cubico;
};

/**
 * @param {String} dimension
 */
Cubico.prototype.assertDimension = function (dimension) {
    if (!this.dimensionMap.hasOwnProperty(dimension))
        throw new Error("Dimension '" + dimension + "' does not exist");
};

/**
 * @param {String} dimension
 */
Cubico.prototype.assertNumericDimension = function (dimension) {
    this.assertDimension(dimension);
    if (this.dimensionMap[dimension].dataType !== Cubico.NUMERIC)
        throw new Error("Dimension '" + dimension + "' is not numeric");
};

Cubico.prototype.getPlainHTMLTable = function () {
    var table = document.createElement("table");
    var tr, td;

    // table headers
    tr = document.createElement("tr");
    for (var j = 0; j < this.dimensions.length; j++) {
        td = document.createElement("th");
        td.innerHTML = this.dimensions[j].name;
        tr.appendChild(td);
    }
    table.appendChild(tr);

    // table body
    for (var i = 0; i < this.storage.length; i++) {
        tr = document.createElement("tr");
        for (j = 0; j < this.dimensions.length; j++) {
            td = document.createElement("td");
            td.innerHTML = this.storage[i][j];
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }

    return table;
};

Cubico.prototype.getFilter = function (comparator, dimension, value) {
    dimension = dimension instanceof String ? this.getDimensionIndex(dimension) : dimension;
    switch (comparator) {
        case "=":
            return Cubico.equalTo(dimension, value);
        case "!=":
            return Cubico.distinctTo(dimension, value);
        case "<":
            return Cubico.lessThan(dimension, value);
        case "<=":
            return Cubico.lessOrEqualThan(dimension, value);
        case ">":
            return Cubico.greaterThan(dimension, value);
        case ">=":
            return Cubico.greaterOrEqualThan(dimension, value);
        default:
            throw new Error("Unknown comparator specified");
    }
};

Cubico.equalTo = function (dimensionIndex, value) {
    return function (record) {
        console.log(record);
        return record[dimensionIndex] === value;
    };
};

Cubico.distinctTo = function (dimensionIndex, value) {
    return function (record) {
        return record[dimensionIndex] != value;
    };
};

Cubico.greaterThan = function (dimensionIndex, value) {
    return function (record) {
        return record[dimensionIndex] > value;
    };
};

Cubico.greaterOrEqualThan = function (dimensionIndex, value) {
    return function (record) {
        return record[dimensionIndex] >= value;
    };
};

Cubico.lessThan = function (dimensionIndex, value) {
    return function (record) {
        return record[dimensionIndex] < value;
    };
};

Cubico.lessOrEqualThan = function (dimensionIndex, value) {
    return function (record) {
        return record[dimensionIndex] <= value;
    };
};
