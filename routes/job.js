/*
    job.js
    Methods for managing jobs
*/
const superagent = require('superagent');

const domain = process.env.SERVER_DOMAIN;
const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app, logger, parse) {

  /*
    Create a new job
  */
  app.post('/job', async function (req, res) {

    //We should use a special user to create jobs

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const status = "new";
    const environment_id = req.body.environment_id; //required
    const type = req.body.type; //required
    const action = req.body.action; //required
    const cloud_provider = req.body.cloud_provider; //optional
    const targets = req.body.targets; //required - client ids or "server" if we should run jobs on a server
    const start_after = req.body.start_after; //optional - a list with job ids which should be finished before this job will start

    const Job = parse.Object.extend("Job");
    const job = new Job();

    job.set("status", status);

    if (cloud_provider){
        job.set("cloud_provider", cloud_provider);
    }

    if (start_after){
        job.set("start_after", start_after);
    }

    if (environment_id) {
        job.set("environment_id", environment_id);
    } else {
      res.statusCode = 400;
      res.end(JSON.stringify({ message: "environment_id is required", id: "bad_request" }));
      return;
    }

    if (type) {
        job.set("type", type);
      } else {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: "type is required", id: "bad_request" }));
        return;
      }

    if (action) {
        job.set("action", action);
      } else {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: "action is required", id: "bad_request" }));
        return;
      }

      if (targets) {
        job.set("targets", targets);
      } else {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: "targets is required", id: "bad_request" }));
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

    //ToDo: add checking that targets and start_after job ids are exist in DB

    var acl = new parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(false);
    acl.setReadAccess(logged_user.objectId, true);
    acl.setWriteAccess(logged_user.objectId, true);
    job.setACL(acl);

    job.save()
      .then(async (saved_job) => {
        res.statusCode = 201;
        res.end(JSON.stringify(saved_job));
      }, (error) => {
        res.statusCode = 401;
        res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: error }));
        logger.error('POST /environment: Failed to create a new job in DB, error: ' + error.message);
      });
  });

  /*
      Get all jobs for :target_id with :status
  */
  app.get('/job/:status/:target_id', async function (req, res) {

    //We should use a special user to get jobs

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const target_id = req.params.target_id;
    //ToDo add checking by status
    const status = req.params.status;

    try {
      const job_res = await superagent.get(parse.serverURL + '/classes/Job/').query({ where: { target_id: target_id }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(job_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });

  /*
    Get a job
  */
  app.get('/job/:job_id', async function (req, res) {
    //We should use a special user to get jobs
    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const job_id = req.params.job_id;
    try {
      const job_res = await superagent.get(parse.serverURL + '/classes/Job/' + job_id).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(job_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });

  /*
    Update a job
  */
  app.put('/job/:job_id', async function (req, res) {

    //We should use a special user to get jobs
    //Note: Only status of a job can be updated

    const logged_user = await auth.handleAllReqs(req, res);
    if (logged_user == null) {
      return;
    }

    const job_id = req.params.job_id;
    var job_update = {};
    const status = req.body.status;
    if (status) {
        job_update.set("status", status);
    }

    try {
      const job_res = await superagent.put(parse.serverURL + '/classes/Job/' + job_id).send(job_update).set({ 'X-Parse-Application-Id': parse.ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
      res.statusCode = 200;
      res.end(JSON.stringify(job_res.body));
    } catch (err) {
      res.statusCode = err.response.status;
      res.end(JSON.stringify({ message: err.response.text, id: "not_found" }));
    }

  });
}
