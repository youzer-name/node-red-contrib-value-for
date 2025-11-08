
const { clearTimer, match, reset } = require('./common.js');

// Local copy of getFormattedNow (was not exported in original common.js)
function getFormattedNow(prefix = 'at') {
    const now = new Date();
    const dateTimeFormat = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour12: false, hour: 'numeric', minute: 'numeric' });
    const [{ value: month },,{ value: day },,{ value: hour },,{ value: minute }] = dateTimeFormat.formatToParts(now);
    return `${prefix}: ${month} ${day}, ${hour}:${minute}`;
}

module.exports = function(RED) {

    function RangeForNode(config) {
    RED.nodes.createNode(this, config);
    let node = this;
    node.timeout = null;
    node.valueMatched = false;
    node.lastValue = null;
    node.orignalMsg = null;

    // Context store and persistence key
    node.store = config.store || undefined;
    const STORE_KEY = "range-for:" + node.id;
    let persisted = node.context().get(STORE_KEY, node.store) || null;

    // Message property config
    node.msgprop = config.msgprop && config.msgprop.trim() ? config.msgprop.trim() : 'payload';

    // Convert units
    if (config.units === "s") { config.for = config.for * 1000; }
    if (config.units === "min") { config.for = config.for * 1000 * 60; }
    if (config.units === "hr") { config.for = config.for * 1000 * 60 * 60; }

    if (config.below === "") { config.below = null; } else { config.below = Number(config.below) }
    if (config.above === "") { config.above = null; } else { config.above = Number(config.above) }

        // --- Restore on start ---
        (function restoreOnStart() {
            if (persisted && persisted.expiry && persisted.orignalMsg) {
                const now = Date.now();
                if (persisted.expiry > now) {
                    // Resume timer
                    node.orignalMsg = persisted.orignalMsg;
                    node.lastValue = persisted.lastValue;
                    node.valueMatched = true;
                    const remaining = persisted.expiry - now;
                    node.timeout = setTimeout(function() {
                        node.send([node.orignalMsg, null]);
                        node.status({fill: "green", shape: "dot", text: `${node.lastValue} ${getFormattedNow('since')}`});
                        node.context().set(STORE_KEY, undefined, node.store);
                    }, remaining);
                    node.status({fill: "green", shape: "ring", text: `${node.lastValue} ${getFormattedNow()}`});
                } else {
                    // Expired while down
                    if (config.expired === "send" || config.expired === "flag") {
                        let outMsg = Object.assign({}, persisted.orignalMsg);
                        if (config.expired === "flag") {
                            outMsg.expired = true;
                            outMsg.triggerOriginalExpiry = persisted.expiry;
                        }
                        setTimeout(function() {
                            node.send([outMsg, null]);
                            node.status({fill: "green", shape: "dot", text: `${node.lastValue} ${getFormattedNow('since')}`});
                        }, 0);
                    }
                    node.context().set(STORE_KEY, undefined, node.store);
                }
            }
        })();

        function makePersistableClone(m) {
            let clean;
            try {
                clean = RED.util.cloneMessage(m);
            } catch(err) {
                try { clean = JSON.parse(JSON.stringify(m)); } catch(e) { clean = {}; }
            }
            if (clean && typeof clean === "object") {
                delete clean.req;
                delete clean.res;
                delete clean.socket;
            }
            return clean;
        }

        function persistState(expiry) {
            try {
                node.context().set(STORE_KEY, {
                    expiry,
                    orignalMsg: makePersistableClone(node.orignalMsg),
                    lastValue: node.lastValue
                }, node.store);
            } catch (err) {
                node.warn("range-for: failed to persist state: " + err);
            }
        }

        node.on('input', function(msg) {
            let value = RED.util.getMessageProperty(msg, node.msgprop);
            if (typeof value === 'undefined' && node.msgprop === 'payload') value = msg.payload; // fallback for legacy
            if (value === 'reset') {
                reset(node, true);
                node.context().set(STORE_KEY, undefined, node.store);
                return;
            }
            let currentValue = Number(value);
            if (!isNaN(currentValue)) {
                // Compare values
                if (config.below !== null && config.above !== null) {
                    // Above AND below set
                    if (currentValue > config.above && currentValue < config.below) {
                        node.valueMatched = true;
                    } else {
                        node.valueMatched = false;
                    }
                } else {
                    // ONLY below set
                    if (config.below !== null) {
                        if (currentValue < config.below) {
                            node.valueMatched = true;
                        } else {
                            node.valueMatched = false;
                        }
                    }
                    // ONLY above set
                    if (config.above !== null) {
                        if (currentValue > config.above) {
                            node.valueMatched = true;
                        } else {
                            node.valueMatched = false;
                        }
                    }
                }
                node.lastValue = currentValue;
                // Act
                if (node.valueMatched) {
                    if (node.timeout === null) {
                        node.orignalMsg = msg;
                        node.timeout = setTimeout(function() {
                            node.send([node.orignalMsg, null]);
                            node.status({fill: "green", shape: "dot", text: `${node.lastValue} ${getFormattedNow('since')}`});
                            node.context().set(STORE_KEY, undefined, node.store);
                        }, config.for);
                        persistState(Date.now() + config.for);
                        node.status({fill: "green", shape: "ring", text: `${node.lastValue} ${getFormattedNow()}`});
                    } else {
                        node.orignalMsg = msg;
                        persistState(Date.now() + (config.for || 0));
                        node.status({fill: "green", shape: "ring", text: `${node.lastValue} ${getFormattedNow()}`});
                    }
                } else {
                    reset(node);
                    node.context().set(STORE_KEY, undefined, node.store);
                }
            }
        });

        node.on('close', function() {
            clearTimer(node);
        });
    }
    RED.nodes.registerType('range-for', RangeForNode);
}
