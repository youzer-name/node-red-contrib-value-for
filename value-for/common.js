const clearTimer = function(node) {
    clearTimeout(node.timeout);
    node.timeout = null;
}

const reset = function(node, manual = false) {
    // Stop timer (if started)
    // Send 2nd output message
    if (node.timeout !== null) {
        const msg = {
            ...node.orignalMsg,
            reset: 1,
        }
        node.send([null, msg]);
        // status message handled in value-for.js if needed
        clearTimer(node);
    }
    // Cleanup
    node.valueMatched = false;
    node.orignalMsg = null;
}

const match = function(node, config, originalMsg) {
    // Start timer (if not yet started)
    if (node.timeout === null) {
        node.timeout = setTimeout(timerFn.bind(null, node, config), config.for);
        // status message handled in value-for.js if needed
    }
    // Store original message (first or latest)
    if (config.keepfirstmsg) {
        if (!node.orignalMsg) {
            node.orignalMsg = originalMsg;
        }
    } else {
        node.orignalMsg = originalMsg;
    }
}

const timerFn = function(node, config) {
    // Send 1st output message
    node.send([node.orignalMsg, null]);
    // status message handled in value-for.js if needed
    if (config.continuous) {
        clearTimer(node);
        match(node, config, node.orignalMsg);
    }
}

module.exports.clearTimer = clearTimer
module.exports.reset = reset
module.exports.match = match
