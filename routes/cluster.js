/*
	cluster.js
	Methods for managing clusters (clients)
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseMasterKey = process.env.PARSE_MASTER_KEY;
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const crypto = require('crypto');
const generatePassword = (
  length = 16,
  wishlist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
) =>
Array.from(crypto.randomFillSync(new Uint32Array(length)))
.map((x) => wishlist[x % wishlist.length])
.join('');

const domain = process.env.SERVER_DOMAIN;

const Auth = require("./auth");
const auth = new Auth();

var provision = require('../internal/provision');
var clusters_to_install = provision.clusters_to_install;

module.exports = function (app) {

	/*
		Get all clusters (clients) connected to the user's account
	*/
	app.get('/clusters', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);

		if (logged_user == null) {
			return;
		}

		try {
			const clusters_res = await superagent.get(Parse.serverURL + '/classes/Cluster/').send({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
			//console.log("Clusters: " + JSON.stringify(clusters_res.body));
			if (clusters_res.statusCode != 200) {
				res.statusCode = 401;
				res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
				return;
			} else {

				var clusterIds = [];
				clusters_res.body.results.forEach((loaded_cluster) => {
					loaded_cluster.projects = [];
					clusterIds.push(loaded_cluster.objectId);
				});

				console.log(clusterIds);
				try {
					const projects_res = await superagent.get(Parse.serverURL + '/classes/Project').query({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
					console.log(projects_res.statusCode);

					if (projects_res.statusCode != 200) {
						res.statusCode = 401;
						res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
						return;
					} else {
						projects_res.body.results.forEach((loaded_project) => {
							clusters_res.body.results.forEach((loaded_cluster) => {
								if (loaded_project.clusters.indexOf(loaded_cluster.objectId) > -1) {
									if (loaded_project.environments != undefined) {
										loaded_project.environments.forEach((environment) => {
											environment.status = 'Deploying...';
										});
										loaded_cluster.projects.push(loaded_project);
									}
								}
							});
						});
						res.statusCode = 200;
						res.end(JSON.stringify(clusters_res.body));
					}
				} catch (err) {
					res.statusCode = 401;
					res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
				}
			}
		} catch (err) {
			res.statusCode = 401;
			res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
		}
	});

	/*
		Get information about a cluster (client)
	*/
	app.get('/cluster/:cluster_id', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);
		const cluster_id = req.params.cluster_id;
		if (logged_user == null) {
			return;
		}

		try {
			const project_res = await superagent.get(Parse.serverURL + '/classes/Cluster/' + cluster_id).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');

			if (project_res.statusCode != 200) {
				res.statusCode = 401;
				res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
				return;
			} else {
				res.statusCode = 200;
				res.end(JSON.stringify(project_res.body));
			}
		} catch (err) {
			res.statusCode = 401;
			res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
		}

	});

	/*
		Provision new cluster (client) to the user's account over SSH
	*/
	app.post('/cluster', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);
		if (logged_user == null) {
			return;
		}

		var new_cluster = {};
		new_cluster.user = logged_user;
		new_cluster.ip = req.body.ip;

		const Cluster = Parse.Object.extend("Cluster");
		const cluster = new Cluster();

		cluster.set("status", "install");
		cluster.set("name", req.body.name);
		cluster.set("type", req.body.type);
		cluster.set("notification_key", generatePassword(32)); //Used for POST /event in dep_backend
		cluster.set("hook_key", generatePassword()); //Used for /deploy/:hook_key in dep_cluster
		cluster.set("region", req.body.region);
		cluster.set("next_port", 4010); //all user project ports start from 4010
		cluster.set("ip", new_cluster.ip);
		cluster.set("stats", {});

		var acl = new Parse.ACL();
		acl.setPublicReadAccess(false);
		acl.setPublicWriteAccess(false);
		acl.setReadAccess(logged_user.objectId, true);
		acl.setWriteAccess(logged_user.objectId, true);

		cluster.setACL(acl);

		cluster.save()
			.then((saved_cluster) => {
				new_cluster.parse_obj = saved_cluster;
				console.log('New cluster added to DB with objectId: ' + saved_cluster.id);

				var cluster_id = saved_cluster.id.toLowerCase();
				//Here will be code to order a server and add dep_backend ssh key

				//Here will be code to add A record new server IP -> cluster_id.${domain}
				ovh.request('POST', `/domain/zone/${domain}/record`, {
					fieldType: 'A',
					subDomain: cluster_id,
					target: new_cluster.ip
				}, function (err, new_record) {
					console.log(err || new_record);
					if (err != null) {
						res.statusCode = 500;
						res.end(JSON.stringify({ message: 'Unexpected server-side error', id: "server_error", add_info: err }));
					}
					//Refresh OVH DNS records
					ovh.request('POST', `/domain/zone/${domain}/refresh`, function (err, is_refreshed) {
						console.log(err || is_refreshed);
						if (err == null) {
							//ToDo
							//1) check if the current user has private/public keys
							//2) if not - generate new using https://www.npmjs.com/package/ssh-keygen
							//3) after that save to user's object and set them to new_cluster.user.publicKey & new_cluster.user.privateKey
							//4) after add new_cluster to clusters_to_install

							//Add cluster to provision queue
							clusters_to_install.push(new_cluster);

							res.statusCode = 201;
							res.end(JSON.stringify({ id: cluster.id }));
						} else {
							res.statusCode = 500;
							res.end(JSON.stringify({ message: 'Unexpected server-side error', id: "server_error", add_info: err }));
						}
					});
				});

			}, (error) => {
				res.statusCode = 500;
				res.end(JSON.stringify({ message: 'Unexpected server-side error', id: "server_error", add_info: error }));
				console.log('Failed to create new cluster in DB, error code: ' + error.message);
			});

	});

	/*
		Delete a cluster (client) from the user's account
	*/
	app.delete('/cluster', async function (req, res) {
		try {
			const logged_user = await auth.handleAllReqs(req, res);
			if (logged_user == null) {
				return;
			}

			const cluster_id = req.body.cluster_id;

			try {
				const del_res = await superagent.delete(Parse.serverURL + '/classes/Cluster/' + cluster_id).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
				console.log(del_res.statusCode);
				if (del_res.statusCode != 200) {
					res.statusCode = del_res.statusCode;
					res.end(JSON.stringify({ message: 'Cannot delete cluster', id: "server_error" }));
				}
			} catch (err) {
				res.statusCode = 401;
				res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
			}

			res.statusCode = 200;
			res.end(JSON.stringify({}));

		} catch (err) {

		}
	});

	/*
		Notify a Deployed.cc server that a cluster (client) has been provisioned
	*/
	app.post('/cluster-ready', async function (req, res) {
		const logged_user = await auth.handleAllReqs(req, res);

		if (logged_user == null) {
			return;
		}

		//ToDo: remove setting pub key, all user clients have to use same keys from User Prase Server Object
		try {
			const put_res = await superagent.put(Parse.serverURL + '/classes/Cluster/' + req.body.cluster_id).send({ "status": "ready", "pub_key": req.body.pub_key }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
			console.log(put_res);
			if (put_res.statusCode == 200) {
				res.statusCode = 200;
				res.end(JSON.stringify({}));
			} else {
				res.statusCode = 401;
				res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
			}
		} catch (err) {
			res.statusCode = 401;
			res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
		}
	})

}