/*
    project.js
    Methods for managing projects
*/
const superagent = require('superagent');

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app, logger, parse) {

    /*
        Create a new project
    */
    app.post('/project', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const name = req.body.name;

        //Check that the new name has the correct format
        //Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long
        var regex = /^([a-z0-9-]{2,30})?$/;
        if (regex.test(name) != true) {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "The project name has invalid format. Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long", id: "bad_request" }));
            return;
        }

        //Check that there is no project with the same name yet
        try {
            const check_name_req = await superagent.get(parse.serverURL + '/classes/Project').query({ where: { name: name }, keys: "name" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
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

        const Project = Parse.Object.extend("Project");
        const project = new Project();
        project.set("name", name);
        project.set("services", []);

        var acl = new Parse.ACL();
        acl.setPublicReadAccess(false);
        acl.setPublicWriteAccess(false);
        acl.setReadAccess(logged_user.objectId, true);
        acl.setWriteAccess(logged_user.objectId, true);

        project.setACL(acl);
        project.save()
            .then(async (saved_project) => {
                logger.info(`New project created: ${saved_project.id}`);
                res.statusCode = 201;
                res.end(JSON.stringify({ project_id: saved_project.id }));
            }, (error) => {
                logger.error('POST /project: Failed to create new project in DB, error code: ' + error.message);
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
            });
        return;

    });


    /*
        Get info about a project
    */
    app.get('/project/:project_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const project_id = req.params.project_id;
        try {
            const project_res = await superagent.get(parse.serverURL + '/classes/Project/' + project_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(project_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
    Delete a project
    */
    app.delete('/project/:project_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const project_id = req.params.project_id;
        try {
            const project_res = await superagent.delete(parse.serverURL + '/classes/Project/' + project_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(project_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
    Update a project
    */
    app.put('/project/:project_id', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        const name = req.body.name;

        //Check that the new name has the correct format
        //Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long
        var regex = /^([a-z0-9-]{2,30})?$/;
        if (regex.test(name) != true) {
            res.statusCode = 400;
            res.end(JSON.stringify({ message: "The project name has invalid format. Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long", id: "bad_request" }));
            return;
        }

        //Check that there is no project with the same name yet
        try {
            const check_name_req = await superagent.get(parse.serverURL + '/classes/Project').query({ where: { name: name }, keys: "name" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
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

        const project_id = req.params.project_id;
        var project_update = {};
        project_update.name = name;

        try {
            const project_res = await superagent.put(parse.serverURL + '/classes/Project/' + project_id).send(project_update).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(project_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });

    /*
        Get all user projects
    */
    app.get('/project', async function (req, res) {

        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        try {
            const project_res = await superagent.get(parse.serverURL + '/classes/Project').query({ order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = 200;
            res.end(JSON.stringify(project_res.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
        }

    });
}