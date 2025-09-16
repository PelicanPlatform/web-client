module.exports = async function (globalConfig, projectConfig) {
	process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';
};