/*
    environment.js
    Methods for managing environments
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const domain = process.env.SERVER_DOMAIN;

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    app.post('/environment', async function (req, res) {
        try{
          const logged_user = await auth.handleAllReqs(req, res);
          if (logged_user == null){
            return;
          }
  
          const project_id = req.body.project_id;
          const env_name = req.body.name;
          const branch_name = req.body.branch;
  
          //Get project created in /checking_git request
          var current_project = {};
          try {
            const get_res = await superagent.get(Parse.serverURL + '/classes/Project/' + project_id).send({}).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
            if (get_res.statusCode != 200){
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
              return;
            }else{
              current_project = get_res.body;
            }
          } catch (err) {
            res.statusCode=401;
            res.end(JSON.stringify({error:err}));
            return;
          }
  
          for (let i = 0; i < current_project.environments.length; i++){
            if (current_project.environments[i].name.toLowerCase() == env_name.toLowerCase()){
              res.statusCode=409;
              res.end(JSON.stringify({message:`Environment ${env_name.toLowerCase()} already exists`, id: "conflict"}));
              throw "Environment with this name already exist";
            }
          }
  
          const cluster_id = current_project.clusters[0];
          var next_port = 0;
          try {
            const put_res = await superagent.get(Parse.serverURL + '/classes/Cluster/' + cluster_id).send({}).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
            next_port = put_res.body.next_port;
            if (put_res.statusCode != 200){
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
              return;
            }
          } catch (err) {
            res.statusCode=401;
            res.end(JSON.stringify({error:err}));
          }
  
          var new_environment = {};
          new_environment.name = env_name;
          new_environment.branch = branch_name;
          new_environment.cluster_port = next_port;
          new_environment.custom_domains = [];
          new_environment.domains = [`${project_id.toLowerCase()}-${env_name.toLowerCase()}.${domain}`];
  
          var update = {};
          update.environments = current_project.environments;
          update.environments.push(new_environment);
  
          try {
            const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + project_id).send(update).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
            if (put_res.statusCode != 200){
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
            }
          } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
          }
  
          //Update cluster with new next port
          try {
            const put_res = await superagent.put(Parse.serverURL + '/classes/Cluster/' + cluster_id).send({"next_port":(next_port + 1)}).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
            if (put_res.statusCode != 200){
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
              return;
            }
          } catch (err) {
            res.statusCode = 401;
            res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
            return;
          }
  
  
          //Adding CNAME record for new environment
          var subdomain = '';
          if (env_name == 'production'){
            subdomain = project_id.toLowerCase();
          }else{
            subdomain = `${project_id.toLowerCase()}-${env_name}`;
          }
          ovh.request('POST', `/domain/zone/${domain}/record`, {
            fieldType: 'CNAME',
            subDomain: subdomain,
            target: cluster_id.toLowerCase() + `.${domain}.`
          }, function (err, new_record) {
            console.log(err || new_record);
            if (err !=  null){
              res.statusCode = 500;
              res.end(JSON.stringify({message:"Unexpected server-side error.", id: "server_error", add_info:err}));
            }
            //Refresh OVH DNS records
            ovh.request('POST', `/domain/zone/${domain}/refresh`, async function (err, is_refreshed) {
              console.log(err || is_refreshed);
              if (err !=  null){
                res.statusCode = 500;
                res.end(JSON.stringify({message:"Unexpected server-side error.", id: "server_error", add_info:err}));
              }
              try {
                const put_res = await superagent.post(`https://${cluster_id.toLowerCase()}.${domain}/environment`).send({"project_id":project_id}).set({'authorization': req.headers['authorization']}).set('accept', 'json');
                  if (put_res.statusCode == 200){
                    console.log('Project added to query');
                    res.statusCode=201;
                    res.end(JSON.stringify({}));
                  }else{
                    res.statusCode = 401;
                    res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
                    console.log('Invalid token');
                  }
                } catch (err) {
                  console.log(err);
                  res.statusCode = 401;
                  res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
                }
              });
            });
  
  
          }catch(err){
            res.statusCode = 401;
            res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
          }
        });
  
        app.delete('/environment', async function (req, res) {
          try{
            const logged_user = await auth.handleAllReqs(req, res);
            if (logged_user == null){
              return;
            }
  
            const project_id = req.body.project_id;
            const env_name = req.body.name;
  
            //Get project created in /checking_git request
            var current_project = {};
            try {
              const get_res = await superagent.get(Parse.serverURL + '/classes/Project/' + project_id).send({}).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
              if (get_res.statusCode != 200){
                res.statusCode = 401;
                res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
                return;
              }else{
                current_project = get_res.body;
              }
            } catch (err) {
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
              return;
            }
  
            var is_environment_found = false;
  
            for (let i = 0; i < current_project.environments.length; i++){
              if (current_project.environments[i].name.toLowerCase() == env_name.toLowerCase()){
                is_environment_found = true;
                current_project.environments.splice(i,1);
              }
            }
  
            if (is_environment_found == false){
              res.statusCode = 404;
              res.end(JSON.stringify({message:"Not found", id: "not_found"}));
              throw "No environment with this name";
            }
  
            var update = {};
            update.environments = current_project.environments;
  
            try {
              const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + project_id).send(update).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
              if (put_res.statusCode != 200){
                res.statusCode = 401;
                res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
              }else{
                res.statusCode=200;
                res.end(JSON.stringify({}))
              }
            } catch (err) {
              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
            }
  
          }catch(err){
            res.statusCode = 401;
            res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
          }
        });
    }