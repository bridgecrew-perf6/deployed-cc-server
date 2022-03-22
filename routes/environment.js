/*
    environment.js
    Methods for managing environments
*/
const superagent = require('superagent');

const domain = process.env.SERVER_DOMAIN;
const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app, logger, parse) {

  /*
    Create a new environment
  */
  app.post('/environment', async function (req, res) {

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
      res.end(JSON.stringify({ message: "The environment name has invalid format. Only letters (a-z), numbers (0-9) and - are allowed and length must be between 2 and 30 characters long", id: "bad_request" }));
      return;
    }

    //Check that there is no environment with the same name yet
    try {
      const check_name_req = await superagent.get(parse.serverURL + '/classes/Environment').query({ where: { name: name }, keys: "name" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-MASTER-Key': parse.PARSE_MASTER_KEY }).set('accept', 'json');
      if (check_name_req.body.results.length > 0) {
        res.statusCode = 409;
        res.end(JSON.stringify({ message: "An environment with the same name already exists", id: "conflict" }));
        return;
      }
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
      return;
    }

    const branch = req.body.branch; //required
    const service_id = req.body.service_id; //required
    const server_ids = req.body.server_ids; //required

    const Environment = parse.Object.extend("Environment");
    const environment = new Environment();

    if (branch) {
      environment.set("branch", branch);
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "branch is required", id: "bad_request" }));
      return;
    }

    //Check that servers with server_ids exists
    //ToDo: Check that target server has available resources to deploy the environment
    if (server_ids) {
      try {
        await superagent.get(parse.serverURL + '/classes/Server/').query({ where: { objectId:{"$in":server_ids}}}).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      } catch (err) {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: "No server with server_id has been found", id: "not_found" }));
        return;
      }
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "server_ids is required", id: "bad_request" }));
      return;
    }

    //Check that a service with service_id exists and get the service name
    var service_name = '';
    if (service_id) {
      try {
        const service_get = await superagent.get(parse.serverURL + '/classes/Service/' + service_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
        service_name = service_get.body.name;
        environment.set("service_id", service_id);
      } catch (err) {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: "No service with this service_id has been found", id: "not_found" }));
        return;
      }
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "service_id is required", id: "bad_request" }));
      return;
    }
    environment.set("domains", [`${name}.${service_name}.${domain}`]);

    //Name field is checked already above
    environment.set("name", name);

    var acl = new parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(false);
    acl.setReadAccess(logged_user.objectId, true);
    acl.setWriteAccess(logged_user.objectId, true);
    environment.setACL(acl);

    environment.save()
      .then(async (saved_environment) => {

        //Schedule a job for adding a new CNAME record for this environment in the format: environment_name.project_name.env.DOMAIN
        //For example, prod.my_project.deployed.cc or dev.my_project.deployed.cc
        const Job = parse.Object.extend("Job");
        const job = new Job();
        job["status"] = "new";
        job["environment_id"] = saved_environment.id;
        job["type"] = "domain";
        job["action"] = "add";
        job["target"] = "server";
        job["data"] = { subDomain: name.service_name, target: `${server_id.toLowerCase()}.${domain}`, record_type:"CNAME" };

        var acl = new parse.ACL();
        acl.setPublicReadAccess(false);
        acl.setPublicWriteAccess(false);
        job.setACL(acl);

        job.save()
          .then(async () => {
            res.statusCode = 201;
            res.end(JSON.stringify(saved_environment));
          }, (error) => {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
            logger.error('POST /environment: Failed to schedule a new job, error: ' + error.message);
          });

      }, (error) => {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
        logger.error('POST /environment: Failed to create new environment in DB, error: ' + error.message);
      });
  });

  /*
      Get all environments of a service
  */
  app.get('/environment/service/:service_id', async function (req, res) {

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const service_id = req.params.service_id;
    try {
      const environment_res = await superagent.get(parse.serverURL + '/classes/Environment/').query({ where: { service_id: service_id }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(environment_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });

  /*
    Get an environment
  */
  app.get('/environment/:environment_id', async function (req, res) {

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const environment_id = req.params.environment_id;
    try {
      const environment_res = await superagent.get(parse.serverURL + '/classes/Environment/' + environment_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(environment_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });

  /*
    Delete an environment
  */
  app.delete('/environment/:environment_id', async function (req, res) {

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const environment_id = req.params.environment_id;
    try {
      const environment_res = await superagent.delete(parse.serverURL + '/classes/Environment/' + environment_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(environment_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });

  /*
    Update an environment
  */
  app.put('/environment/:environment_id', async function (req, res) {

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const environment_id = req.params.environment_id;
    var environment_update = {};
    const branch = req.body.branch;
    if (branch) {
      environment_update.set("branch", branch);
    }

    try {
      const environment_res = await superagent.put(parse.serverURL + '/classes/Environment/' + environment_id).send(environment_update).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(environment_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });
}
