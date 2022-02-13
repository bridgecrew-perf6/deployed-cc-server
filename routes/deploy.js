/*
    deploy.js
    Methods for project deployment
*/
const fs = require('fs')
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;
const ParseMasterKey = process.env.PARSE_MASTER_KEY;

module.exports = function (app, logger) {
    /*
        Deploy a project
    */
    app.post('/deploy/:hook_key', async function (req, res) {

        const hook_key = req.params.hook_key;

        if (!hook_key) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Invalid token. Check that a hook url you added to this git repository is correct." }));
            return;
        }

        //Try to find a project with :hook_key
        var current_project = {};
        try {
            const get_project = await superagent.get(Parse.serverURL + '/classes/Project').query({ where: { hook_key: hook_key }, keys:"name" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
            if (get_project.body.results.length == 0) {
                res.statusCode = 401;
                res.end(JSON.stringify({ error: "Invalid token. Check that a hook url you added to this git repository is correct." }));
                return;
            }else{
                current_project = get_project.body.results[0];
            }
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
            return;
        }

        //Get info about commit, branch & git url
        //ToDo: 
        const repo_name = req.body.repository.name;
        const branch_to_deploy = req.body.push.changes[0].new.name; //for github - its req.body.ref or req.body.base_ref, should be something refs/heads/main
        
        //Send POST /deploy to all deployed-clients

        res.statusCode = 200;
        res.end(JSON.stringify({}));

    });

}