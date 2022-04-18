/*
	server.js
	Methods for managing servers
*/
const superagent = require('superagent');

const domain = process.env.SERVER_DOMAIN;

const Auth = require("./auth");
const auth = new Auth();

var provision = require('../internal/provision');

module.exports = function (app, logger, parse) {

	/*
		Get all servers connected to the user's account
	*/
	app.get('/servers', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);

		if (logged_user == null) {
			return;
		}

		try {
			const servers_res = await superagent.get(parse.serverURL + '/classes/Server/').send({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
			res.statusCode = 200;
			res.end(JSON.stringify(servers_res.body));
		} catch (err) {
			res.statusCode = err.response.status;
			res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
		}
	});

	/*
		Get information about a server
	*/
	app.get('/server/:server_id', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);
		const server_id = req.params.server_id;
		if (logged_user == null) {
			return;
		}

		try {
			const server_res = await superagent.get(parse.serverURL + '/classes/Server/' + server_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-MASTER-Key': parse.PARSE_MASTER_KEY }).set('accept', 'json');
			res.statusCode = 200;
			res.end(JSON.stringify(server_res.body));
		} catch (err) {
			res.statusCode = err.response.status;
			res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
		}

	});

	/*
		Provision a new server
	*/
	app.post('/server', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);
		if (logged_user == null) {
			return;
		}

		var new_server = {};
		new_server.user = logged_user;
		new_server.ip = req.body.ip;

		const Server = parse.Object.extend("Server");
		const server = new Server();

		server.set("status", "install");
		server.set("name", req.body.name);
		server.set("type", req.body.type);
		server.set("region", req.body.region);
		server.set("ip", new_server.ip);
		server.set("stats", {});

		var acl = new parse.ACL();
		acl.setPublicReadAccess(false);
		acl.setPublicWriteAccess(false);
		acl.setReadAccess(logged_user.objectId, true);
		acl.setWriteAccess(logged_user.objectId, true);

		server.setACL(acl);

		server.save()
			.then((saved_server) => {
				new_server.parse_obj = saved_server;

				var server_id = saved_server.id.toLowerCase();
				res.statusCode = 201;
				res.end(JSON.stringify({ id: saved_server.id }));

				//ToDo: Create new job to add a domain to DNS records
				//Add a job to provision a server

			}, (error) => {
				res.statusCode = 500;
				res.end(JSON.stringify({ message: 'Unexpected server-side error', id: "server_error", add_info: error }));
			});

	});

	/*
		Delete a server
	*/
	app.delete('/server', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);
		if (logged_user == null) {
			return;
		}

		const server_id = req.body.server_id;

		try {
			const del_res = await superagent.delete(parse.serverURL + '/classes/Server/' + server_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
			res.statusCode = 200;
			res.end(JSON.stringify(del_res.body));
		} catch (err) {
			res.statusCode = err.response.status;
			res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
		}
	});

	/*
		Notification that a server is ready
	*/
	app.post('/server-ready', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);

		if (logged_user == null) {
			return;
		}

		//ToDo: remove setting pub key, all user clients have to use same keys from User Prase Server Object
		try {
			const put_res = await superagent.put(parse.serverURL + '/classes/Server/' + req.body.server_id).send({ "status": "ready" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
			res.statusCode = 200;
			res.end(JSON.stringify(put_res.body));
		} catch (err) {
			res.statusCode = err.response.status;
			res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
		}
	})

}