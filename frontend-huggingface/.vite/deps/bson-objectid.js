import {
  __commonJS
} from "./chunk-6LNZPZHA.js";

// node_modules/bson-objectid/objectid.js
var require_objectid = __commonJS({
  "node_modules/bson-objectid/objectid.js"(exports, module) {
    var MACHINE_ID = Math.floor(Math.random() * 16777215);
    var index = ObjectID.index = parseInt(Math.random() * 16777215, 10);
    var pid = (typeof process === "undefined" || typeof process.pid !== "number" ? Math.floor(Math.random() * 1e5) : process.pid) % 65535;
    var BufferCtr = (() => {
      try {
        return _Buffer;
      } catch (_) {
        try {
          return Buffer;
        } catch (_2) {
          return null;
        }
      }
    })();
    var isBuffer = function(obj) {
      return !!(obj != null && obj.constructor && typeof obj.constructor.isBuffer === "function" && obj.constructor.isBuffer(obj));
    };
    var hexTable = [];
    for (i = 0; i < 256; i++) {
      hexTable[i] = (i <= 15 ? "0" : "") + i.toString(16);
    }
    var i;
    var checkForHexRegExp = new RegExp("^[0-9a-fA-F]{24}$");
    var decodeLookup = [];
    i = 0;
    while (i < 10) decodeLookup[48 + i] = i++;
    while (i < 16) decodeLookup[65 - 10 + i] = decodeLookup[97 - 10 + i] = i++;
    function ObjectID(id) {
      if (!(this instanceof ObjectID)) return new ObjectID(id);
      if (id && (id instanceof ObjectID || id._bsontype === "ObjectID"))
        return id;
      this._bsontype = "ObjectID";
      if (id == null || typeof id === "number") {
        this.id = this.generate(id);
        return;
      }
      var valid = ObjectID.isValid(id);
      if (!valid && id != null) {
        throw new Error(
          "Argument passed in must be a single String of 12 bytes or a string of 24 hex characters"
        );
      } else if (valid && typeof id === "string" && id.length === 24) {
        return ObjectID.createFromHexString(id);
      } else if (id != null && id.length === 12) {
        this.id = id;
      } else if (id != null && typeof id.toHexString === "function") {
        return id;
      } else {
        throw new Error(
          "Argument passed in must be a single String of 12 bytes or a string of 24 hex characters"
        );
      }
    }
    module.exports = ObjectID;
    ObjectID.default = ObjectID;
    ObjectID.createFromTime = function(time) {
      time = parseInt(time, 10) % 4294967295;
      return new ObjectID(hex(8, time) + "0000000000000000");
    };
    ObjectID.createFromHexString = function(hexString) {
      if (typeof hexString === "undefined" || hexString != null && hexString.length !== 24) {
        throw new Error(
          "Argument passed in must be a single String of 12 bytes or a string of 24 hex characters"
        );
      }
      var data = "";
      var i2 = 0;
      while (i2 < 24) {
        data += String.fromCharCode(decodeLookup[hexString.charCodeAt(i2++)] << 4 | decodeLookup[hexString.charCodeAt(i2++)]);
      }
      return new ObjectID(data);
    };
    ObjectID.isValid = function(id) {
      if (id == null) return false;
      if (typeof id === "number") {
        return true;
      }
      if (typeof id === "string") {
        return id.length === 12 || id.length === 24 && checkForHexRegExp.test(id);
      }
      if (id instanceof ObjectID) {
        return true;
      }
      if (isBuffer(id)) {
        return ObjectID.isValid(id.toString("hex"));
      }
      if (typeof id.toHexString === "function") {
        if (BufferCtr && (id.id instanceof BufferCtr || typeof id.id === "string")) {
          return id.id.length === 12 || id.id.length === 24 && checkForHexRegExp.test(id.id);
        }
      }
      return false;
    };
    ObjectID.prototype = {
      constructor: ObjectID,
      /**
       * Return the ObjectID id as a 24 byte hex string representation
       *
       * @return {String} return the 24 byte hex string representation.
       * @api public
       */
      toHexString: function() {
        if (!this.id || !this.id.length) {
          throw new Error(
            "invalid ObjectId, ObjectId.id must be either a string or a Buffer, but is [" + JSON.stringify(this.id) + "]"
          );
        }
        if (this.id.length === 24) {
          return this.id;
        }
        if (isBuffer(this.id)) {
          return this.id.toString("hex");
        }
        var hexString = "";
        for (var i2 = 0; i2 < this.id.length; i2++) {
          hexString += hexTable[this.id.charCodeAt(i2)];
        }
        return hexString;
      },
      /**
       * Compares the equality of this ObjectID with `otherID`.
       *
       * @param {Object} otherId ObjectID instance to compare against.
       * @return {Boolean} the result of comparing two ObjectID's
       * @api public
       */
      equals: function(otherId) {
        if (otherId instanceof ObjectID) {
          return this.toString() === otherId.toString();
        } else if (typeof otherId === "string" && ObjectID.isValid(otherId) && otherId.length === 12 && isBuffer(this.id)) {
          return otherId === this.id.toString("binary");
        } else if (typeof otherId === "string" && ObjectID.isValid(otherId) && otherId.length === 24) {
          return otherId.toLowerCase() === this.toHexString();
        } else if (typeof otherId === "string" && ObjectID.isValid(otherId) && otherId.length === 12) {
          return otherId === this.id;
        } else if (otherId != null && (otherId instanceof ObjectID || otherId.toHexString)) {
          return otherId.toHexString() === this.toHexString();
        } else {
          return false;
        }
      },
      /**
       * Returns the generation date (accurate up to the second) that this ID was generated.
       *
       * @return {Date} the generation date
       * @api public
       */
      getTimestamp: function() {
        var timestamp = /* @__PURE__ */ new Date();
        var time;
        if (isBuffer(this.id)) {
          time = this.id[3] | this.id[2] << 8 | this.id[1] << 16 | this.id[0] << 24;
        } else {
          time = this.id.charCodeAt(3) | this.id.charCodeAt(2) << 8 | this.id.charCodeAt(1) << 16 | this.id.charCodeAt(0) << 24;
        }
        timestamp.setTime(Math.floor(time) * 1e3);
        return timestamp;
      },
      /**
      * Generate a 12 byte id buffer used in ObjectID's
      *
      * @method
      * @param {number} [time] optional parameter allowing to pass in a second based timestamp.
      * @return {string} return the 12 byte id buffer string.
      */
      generate: function(time) {
        if ("number" !== typeof time) {
          time = ~~(Date.now() / 1e3);
        }
        time = parseInt(time, 10) % 4294967295;
        var inc = next();
        return String.fromCharCode(
          time >> 24 & 255,
          time >> 16 & 255,
          time >> 8 & 255,
          time & 255,
          MACHINE_ID >> 16 & 255,
          MACHINE_ID >> 8 & 255,
          MACHINE_ID & 255,
          pid >> 8 & 255,
          pid & 255,
          inc >> 16 & 255,
          inc >> 8 & 255,
          inc & 255
        );
      }
    };
    function next() {
      return index = (index + 1) % 16777215;
    }
    function hex(length, n) {
      n = n.toString(16);
      return n.length === length ? n : "00000000".substring(n.length, length) + n;
    }
    var inspect = Symbol && Symbol.for && Symbol.for("nodejs.util.inspect.custom") || "inspect";
    ObjectID.prototype[inspect] = function() {
      return "ObjectID(" + this + ")";
    };
    ObjectID.prototype.toJSON = ObjectID.prototype.toHexString;
    ObjectID.prototype.toString = ObjectID.prototype.toHexString;
  }
});
export default require_objectid();
//# sourceMappingURL=bson-objectid.js.map
