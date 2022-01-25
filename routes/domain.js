/*
    domain.js
    Methods for managing domains
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    /*
        Add custom domain
    */
    app.post('/domain', async function (req, res) {
        try {
            const logged_user = await auth.handleAllReqs(req, res);
            if (logged_user == null) {
                return;
            }

            const project_id = req.body.project_id;
            const domain = req.body.domain;
            const environment_name = req.body.environment;

            //Get project created in /checking_git request
            var current_project = {};
            try {
                const get_res = await superagent.get(Parse.serverURL + '/classes/Project/' + project_id).send({}).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
                if (get_res.statusCode != 200) {
                    res.statusCode = 401;
                    res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                    return;
                } else {
                    current_project = get_res.body;
                }
            } catch (err) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return;
            }

            var is_sync_needed = true;
            for (let i = 0; i < current_project.environments.length; i++) {
                if (current_project.environments[i].name.toLowerCase() == environment_name.toLowerCase()) {
                    if (domain == '') {
                        //User removes domain
                        current_project.environments[i].domains = [current_project.environments[i].domains[0]];
                        is_sync_needed == false;
                    } else if (current_project.environments[i].domains.length > 1 && domain != current_project.environments[i].domains[1]) {
                        //User adds domain
                        current_project.environments[i].domains = [current_project.environments[i].domains[0], domain];
                        is_sync_needed = true;
                    } else if (current_project.environments[i].domains.length == 1) {
                        //User hasn't a custom domain yet and adds it now
                        current_project.environments[i].domains = [current_project.environments[i].domains[0], domain];
                        is_sync_needed == true;
                    } else {
                        //User doesn't change domain
                        is_sync_needed == false;
                    }
                }
            }

            if (is_sync_needed == false) {
                res.statusCode = 201;
                res.end(JSON.stringify({ result: true }));
                return;
            }

            try {
                const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + project_id).send({ "environments": current_project.environments }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
                if (put_res.statusCode != 200) {
                    res.statusCode = 401;
                    res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                } else {

                    //Send request /sync_project to the cluster
                    try {
                        const put_res = await superagent.get(`https://${current_project.clusters[0].toLowerCase()}.${domain}/sync_project/${project_id}`).set({ 'authorization': req.headers['authorization'] }).set('accept', 'json');
                        if (put_res.statusCode == 200) {
                            console.log('Project added to sync query');
                            res.statusCode = 201;
                            res.end(JSON.stringify({ result: true }));
                        } else {
                            console.log('Invalid token');
                            res.statusCode = 401;
                            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                        }
                    } catch (err) {
                        console.log(err);
                        res.statusCode = 401;
                        res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
                    }

                }
            } catch (err) {
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
            }


        } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized", add_info: err }));
        }
    });
}