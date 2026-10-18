// Stand-in for a Node builtin that the renderer bundle only reaches through a code path it never
// runs (the MCP client uses the SSE transport, not the stdio one). Webpack 4 cannot resolve the
// "node:" scheme at all, so the import is redirected here instead of failing the whole bundle.
module.exports = {}
