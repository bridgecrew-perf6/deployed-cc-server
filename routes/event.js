/*
    event.js
    Methods for managing events
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseMasterKey = process.env.PARSE_MASTER_KEY;
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    app.post('/event', async function (req, res) {
        try {
            const cluster_res = await superagent.get(Parse.serverURL + '/classes/Cluster/' + req.body.cluster_id).send({}).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
            if (cluster_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            } else {
                let notif_key = req.headers['notification-key'];

                if (notif_key != cluster_res.body.notification_key) {
                    res.statusCode = 401;
                    res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                    return;
                }

                //New Event object
                try {
                    try {
                        console.log("Status for " + req.body.project_id);

                        const project_res = await superagent.get(Parse.serverURL + '/classes/Project/' + req.body.project_id).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
                        if (project_res.statusCode != 200) {
                            //ToDo Handle error
                            console.error("/event: request GET /Project, status code: " + project_res.statusCode);
                        } else {
                            console.log(project_res.body);
                            const loaded_project = project_res.body;
                            var status_update = {};
                            if (loaded_project.statuses != undefined) {
                                status_update = loaded_project.statuses;
                            }
                            status_update[`${loaded_project.name}-${req.body.environment}`] = req.body.msg;
                            console.log(status_update);
                            const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + req.body.project_id).send({ "statuses": status_update }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
                            if (put_res.statusCode != 200) {
                                console.error("/event: request PUT /Project, status code: " + put_res.statusCode);
                            }
                        }
                    } catch (err) {
                        res.statusCode = 401;
                        res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
                    }


                    var new_event = req.body;
                    new_event.ACL = cluster_res.body.ACL;
                    const post_res = await superagent.post(Parse.serverURL + '/classes/Event').send(new_event).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
                    console.log(post_res.statusCode);
                    if (post_res.statusCode != 201) {
                        res.statusCode = post_res.statusCode;
                        res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                        return;
                    } else {
                        res.statusCode = 201;
                        res.end(JSON.stringify({ result: true, event_id: post_res.body.objectId }));
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

    app.get('/event/:project_id', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }

        try {
            const events_res = await superagent.get(Parse.serverURL + '/classes/Event').query({ where: { project_id: req.params.project_id }, order: "-createdAt" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            if (events_res.statusCode != 200) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            } else {
                res.statusCode = 200;
                res.end(JSON.stringify(events_res.body));
            }
        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }

    });
}