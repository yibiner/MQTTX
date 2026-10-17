// Stand-in for Node builtins a dependency imports with the "node:" scheme, which webpack 4 cannot
// resolve. The renderer never runs the affected code path (MQTTX Plus Copilot uses the SSE
// transport of the MCP client, not the stdio one).
module.exports = {}
