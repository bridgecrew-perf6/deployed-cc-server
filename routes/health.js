//Checking that a server works
module.exports = function (app) {
	app.get('/hey', (req, res) => {
		res.statusCode = 200;
		res.end();
	});
}