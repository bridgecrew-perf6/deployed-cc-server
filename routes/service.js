/*
    service.js
    Methods for managing services
*/
const superagent = require('superagent');

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app, logger, parse) {

    /*
        Get all services of a project
    */
    app.get('/service/project/:project_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const project_id = req.params.project_id;
        try {
            const service_res = await superagent.get(parse.serverURL + '/classes/Service/').query({ where: { project_id: project_id }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(service_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
        Get all user services
    */
    app.get('/service', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        try {
            const services_res = await superagent.get(parse.serverURL + '/classes/Service').query({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(services_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
        Get info about a service
    */
    app.get('/service/:service_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const service_id = req.params.service_id;
        try {
            const service_res = await superagent.get(parse.serverURL + '/classes/Service/' + service_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(service_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
    Delete a service
    */
    app.delete('/service/:service_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const service_id = req.params.service_id;
        try {
            const service_res = await superagent.delete(parse.serverURL + '/classes/Service/' + service_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(service_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
    Update a service
    */
    app.put('/service/:service_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        //Not all fields can be updated
        const service_id = req.params.service_id;
        var service_update = {};
        if (req.body.port) {
            service_update.port = parseInt(req.body.port);
        }
        if (req.body.build_cmd) {
            service_update.build_cmd = req.body.build_cmd;
        }
        if (req.body.run_cmd) {
            service_update.run_cmd = req.body.run_cmd;
        }
        if (req.body.publish_dir) {
            service_update.publish_dir = req.body.publish_dir;
        }
        if (req.body.runtime) {
            service_update.runtime = req.body.runtime;
        }
        if (req.body.runtime_version) {
            service_update.runtime_version = req.body.runtime_version;
        }

        try {
            const service_res = await superagent.put(parse.serverURL + '/classes/Service/' + service_id).send(service_update).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(service_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
        Create a new service
    */
    app.post('/service', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        const name = req.body.name;
        if (logged_user == null) {
            return;
        }

        //Check that the new name has the correct format
        //Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long
        var regex = /^([a-z0-9-]{2,30})?$/;
        if (regex.test(name) != true) {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "The project name has invalid format. Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long", id: "bad_request" }));
            return;
        }

        //Check that there is no service with the same name yet
        try {
            const check_name_req = await superagent.get(parse.serverURL + '/classes/Service').query({ where: { name: name }, keys: "name" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-MASTER-Key': parse.PARSE_MASTER_KEY }).set('accept', 'json');
            if (check_name_req.body.results.length > 0) {
                res.statusCode = 409;
                res.end(JSON.stringify({ message: "A project with the same name already exists", id: "conflict" }));
                return;
            }
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
            return;
        }

        const Service = parse.Object.extend("Service");
        const service = new Service();
        if (req.body.git_url) {
            service.set("git_url", req.body.git_url);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "git_url is required, format: git@bitbucket.org:coded-sh/repository_name.git", id: "bad_request" }));
            return;
        }

        if (req.body.project_id) {
            service.set("project_id", req.body.project_id);
            try {
                await superagent.get(parse.serverURL + '/classes/Project/' + req.body.project_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            } catch (err) {
                res.statusCode = 404;
                res.end(JSON.stringify({ message: "No project with this project_id found", id: "not_found" }));
                return;
            }
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "project_id is required", id: "bad_request" }));
            return;
        }

        if (req.body.hook_key) {
            service.set("hook_key", req.body.hook_key);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "hook_key is required, hook_key is a random string", id: "bad_request" }));
            return;
        }

        //Name field is checked already above
        service.set("name", req.body.name);

        //Type can be app, database or one_click_app
        if (req.body.type && ["app", "database", "one_click_app"].indexOf(req.body.type) != -1) {
            service.set("type", req.body.type);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "type is required and can be 'app', 'database' or 'one_click_app'", id: "bad_request" }));
            return;
        }

        if (req.body.port) {
            service.set("port", req.body.port);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "port is required", id: "bad_request" }));
            return;
        }

        if (req.body.build_cmd) {
            service.set("build_cmd", req.body.build_cmd);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "build_cmd is required", id: "bad_request" }));
            return;
        }

        if (req.body.run_cmd) {
            service.set("run_cmd", req.body.run_cmd);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "run_cmd is required", id: "bad_request" }));
            return;
        }

        if (req.body.publish_dir) {
            service.set("publish_dir", req.body.publish_dir);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "publish_dir is required", id: "bad_request" }));
            return;
        }

        if (req.body.runtime) {
            service.set("runtime", req.body.runtime);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "runtime is required", id: "bad_request" }));
            return;
        }

        if (req.body.runtime_version) {
            service.set("runtime_version", req.body.runtime_version);
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "runtime_version is required", id: "bad_request" }));
            return;
        }

        var acl = new parse.ACL();
        acl.setPublicReadAccess(false);
        acl.setPublicWriteAccess(false);
        acl.setReadAccess(logged_user.objectId, true);
        acl.setWriteAccess(logged_user.objectId, true);
        service.setACL(acl);

        service.save()
            .then(async (saved_service) => {
                res.statusCode = 201;
                res.end(JSON.stringify(saved_service));
            }, (error) => {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
                logger.error('POST /service: Failed to create new project in DB, error code: ' + error.message);
            });
    });

}