/*
	project.js
	Methods for managing projects
*/
const fs = require('fs')
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const domain = process.env.SERVER_DOMAIN;
const ovh_api = require('ovh')({
  endpoint: process.env.OVH_ENDPOINT,
  appKey: process.env.OVH_APP_KEY,
  appSecret: process.env.OVH_APP_SECRET,
  consumerKey: process.env.OVH_CONSUMER_KEY
});

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    /*
        Create an empty one-click app
    */
    app.post('/marketplace_app', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);

        if (logged_user == null) {
            return;
        }

        //Create new Project in ParseServer
        const Project = Parse.Object.extend("Project");
        const project = new Project();
        project.set("status", "waiting_for_payment");
        project.set("clusters", [req.body.cluster_id]);

        var acl = new Parse.ACL();
        acl.setPublicReadAccess(false);
        acl.setPublicWriteAccess(false);
        acl.setReadAccess(logged_user.objectId, true);
        acl.setWriteAccess(logged_user.objectId, true);
        project.setACL(acl);

        project.save()
            .then(async (saved_project) => {
                res.statusCode = 201;
                res.end(JSON.stringify({ project_id: saved_project.id }));
            }, (error) => {
                res.statusCode = 500;
                res.end(JSON.stringify({ message: 'Unexpected server-side error.', id: "server_error", add_info: error }));
                console.log('Failed to create new project in DB, error code: ' + error.message);
            });
    });

    /*
        Get all projects deployed on a cluster (client)
    */
    app.get('/projects/:cluster_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        const cluster_id = req.params.cluster_id;
        if (logged_user == null) {
            return;
        }

        try {
            const projects_res = await superagent.get(Parse.serverURL + '/classes/Project').query({ where: { clusters: cluster_id }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            console.log(projects_res.statusCode);

            if (projects_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ err: 'Invalid token, cannot get clusters' }));
                return;
            } else {
                var projects = [];
                projects_res.body.results.forEach((loaded_project) => {
                    if (loaded_project.environments != undefined) {
                        loaded_project.environments.forEach((environment) => {
                            environment.status = 'Deploying...';
                        });
                        projects.push(loaded_project);
                    }
                });
                res.statusCode = 200;
                res.end(JSON.stringify({ results: projects }));
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

    });

    /*
        Get all user projects
    */
    app.get('/projects', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        const cluster_id = req.params.cluster_id;
        if (logged_user == null) {
            return;
        }

        try {
            const projects_res = await superagent.get(Parse.serverURL + '/classes/Project').query({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            console.log(projects_res.statusCode);

            if (projects_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
                return;
            } else {
                var projects = [];
                projects_res.body.results.forEach((loaded_project) => {
                    if (loaded_project.environments != undefined) {
                        loaded_project.environments.forEach((environment) => {
                            environment.status = 'Deploying...';
                        });
                        projects.push(loaded_project);
                    }
                });
                res.statusCode = 200;
                res.end(JSON.stringify({ results: projects }));
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

    });

    /*
        Get info about a project
    */
    app.get('/project/:project_id', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        const project_id = req.params.project_id;
        if (logged_user == null) {
            return;
        }

        try {
            const project_res = await superagent.get(Parse.serverURL + '/classes/Project/' + project_id).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');

            if (project_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
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
        Create a new project
        New project flow: POST /check_git -> wait until the project has a status "" -> POST /project
    */
    app.post('/project', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        const project_id = req.body.project_id;
        if (logged_user == null) {
            return;
        }

        var headers = { 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] };
        if (req.headers['master_key'] != undefined) {
            headers['X-Parse-MASTER-Key'] = req.headers['master_key'];
        }
        //Get project created in /checking_git request
        var current_project = {};
        try {
            const get_res = await superagent.get(Parse.serverURL + '/classes/Project/' + project_id).send({}).set(headers).set('accept', 'json');
            console.log("2 !!!!" + get_res.status);
            if (get_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            } else {
                current_project = get_res.body;
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

        var next_port = 0;
        //Get next available port on this cluster
        const cluster_id = current_project.clusters[0];
        try {
            const put_res = await superagent.get(Parse.serverURL + '/classes/Cluster/' + cluster_id).send({}).set(headers).set('accept', 'json');
            console.log("Next port: " + put_res.body.next_port);
            next_port = put_res.body.next_port;
            if (put_res.statusCode != 200) {
                console.log("2.5 !!!!");
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
                return;
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

        //Create branches from requested branch names
        var environments = [];
        try {
            req.body.environments.forEach((environment) => {
                var new_environment = {};
                new_environment.name = environment.name;
                var domains = [];
                if (new_environment.name == 'production') {
                    //domains.push(`${project_id.toLowerCase()}.${domain}`);
                    domains.push(`${req.body.name.toLowerCase()}.${domain}`);
                } else {
                    //domains.push(`${project_id.toLowerCase()}-${environment.branch}.${domain}`);
                    domains.push(`${req.body.name.toLowerCase()}-${environment.branch}.${domain}`);
                }
                new_environment.domains = domains;
                new_environment.branch = environment.branch;
                new_environment.cluster_port = next_port;
                next_port = next_port + 1;
                new_environment.custom_domains = environment.custom_domains;
                environments.push(new_environment);
            });

            console.log("2.8 !!!!");

            var project_update = {};
            project_update.status = "deploy";
            project_update.environments = environments;
            project_update.name = req.body.name;
            project_update.port = parseInt(req.body.port);
            project_update.build_cmd = req.body.build_cmd;
            project_update.run_cmd = req.body.run_cmd;
            project_update.publish_dir = req.body.publish_dir;
            project_update.runtime = req.body.runtime;
            project_update.runtime_version = req.body.runtime_version;
            project_update.docker_run_cmd = req.body.docker_run_cmd;

            //Generate Ddockerfile
            var dockerfile = '';
            try {
                dockerfile = fs.readFileSync(`./public/templates/dockerfile_${req.body.runtime}`, 'utf8');
            } catch (e) {
                console.log('Cannot load Dockerfile:', e.stack);
            }

            console.log("2.9 !!!!");

            dockerfile = dockerfile.replace(/{{docker_runtime}}/g, req.body.runtime);
            dockerfile = dockerfile.replace(/{{docker_runtime_version}}/g, req.body.runtime_version);
            dockerfile = dockerfile.replace(/{{docker_build}}/g, req.body.build_cmd);
            dockerfile = dockerfile.replace(/{{docker_run}}/g, req.body.run_cmd);
            dockerfile = dockerfile.replace(/{{docker_port}}/g, req.body.port);
            project_update.dockerfile = dockerfile;
            console.log("3.5 !!!!" + JSON.stringify(project_update));

            const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + project_id).send(project_update).set(headers).set('accept', 'json');
            console.log("3 !!!!" + put_res.statusCode);

            if (put_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

        //Update cluster with new next port
        try {

            const put_res = await superagent.put(Parse.serverURL + '/classes/Cluster/' + cluster_id).send({ "next_port": next_port }).set(headers).set('accept', 'json');
            if (put_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
            return;
        }

        res.statusCode = 200;
        res.end(JSON.stringify(project_update));

        //Adding CNAME records for new projects
        var cname_records_amount = environments.length;
        environments.forEach((environment) => {
            var env_name = environment.name;
            var subdomain = '';
            if (env_name == 'production') {
                subdomain = req.body.name.toLowerCase();
            } else {ы
                subdomain = `${req.body.name.toLowerCase()}-${env_name}`;
            }

            ovh_api.request('POST', `/domain/zone/${domain}/record`, {
                fieldType: 'CNAME',
                subDomain: subdomain,
                target: cluster_id.toLowerCase() + `.${domain}.`
            }, function (err, new_record) {
                console.log(err || new_record);
                //Refresh OVH DNS records
                ovh_api.request('POST', `/domain/zone/${domain}/refresh`, async function (err, is_refreshed) {
                    console.log(err || is_refreshed);
                    cname_records_amount = cname_records_amount - 1;
                    if (cname_records_amount == 0) {
                        try {
                            console.log("!!!!!deploying!!!!!");
                            const put_res = await superagent.post(`https://${cluster_id.toLowerCase()}.${domain}/project`).send({ "project_id": project_id }).set({ 'authorization': req.headers['authorization'] }).set('accept', 'json');
                            if (put_res.statusCode == 200) {
                                console.log('Project added to query');
                            } else {
                                console.log('Invalid token');
                            }
                        } catch (err) {
                            console.log(err);
                        }
                    }
                });
            });
        });
    });

    /*
        Check that a client has rights to clone a git repository
        New project flow: POST /check_git -> wait until the project has a status "" -> POST /project
    */
    app.post('/check_git', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);

        if (logged_user == null) {
            return;
        }

        //Check if the user has a project with the same git url on this server
        try {
            const get_res = await superagent.get(Parse.serverURL + '/classes/Project').send({ where: { clusters: req.body.cluster_id, git_url: req.body.git_url } }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            if (get_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ error: 'Invalid token, cannot get projects' }));
                return;
            } else {
                if (get_res.body.results.length > 0) {
                    res.statusCode = 403;
                    res.end(JSON.stringify({ error: 'The project with this git url is deployed already.' }));
                    return;
                } else {
                    //Create new Project in ParseServer with status 'checking_git'
                    const Project = Parse.Object.extend("Project");
                    const project = new Project();
                    project.set("status", "checking_git");
                    project.set("git_url", req.body.git_url);
                    project.set("clusters", [req.body.cluster_id]);

                    var acl = new Parse.ACL();
                    acl.setPublicReadAccess(false);
                    acl.setPublicWriteAccess(false);
                    acl.setReadAccess(logged_user.objectId, true);
                    acl.setWriteAccess(logged_user.objectId, true);
                    project.setACL(acl);

                    project.save()
                        .then(async (saved_project) => {
                            //Send request to a cluster with req.body.cluster_id
                            try {
                                const put_res = await superagent.post(`https://${req.body.cluster_id.toLowerCase()}.${domain}/check_git`).send({ git_url: req.body.git_url, project_id: saved_project.id }).set({ 'authorization': req.headers['authorization'] }).set('accept', 'json');
                                //const put_res = await superagent.post(`http://localhost:4004/check_git`).send({git_url:req.body.git_url,project_id:saved_project.id}).set({'authorization': req.headers['authorization']}).set('accept', 'json');

                                if (put_res.statusCode == 200) {
                                    console.log('Project added to query');
                                    res.statusCode = 201;
                                    res.end(JSON.stringify({ project_id: saved_project.id }));
                                } else {
                                    console.log('Invalid token');
                                    res.statusCode = 401;
                                    res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                                }
                            } catch (err) {
                                console.log(err);
                            }
                        }, (error) => {
                            res.statusCode = 401;
                            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
                            console.log('Failed to create new project in DB, error code: ' + error.message);
                        });
                    return;
                }
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

    });

}