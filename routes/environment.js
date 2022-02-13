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
const ovh = require('ovh')({
	endpoint: process.env.OVH_ENDPOINT,
	appKey: process.env.OVH_APP_KEY,
	appSecret: process.env.OVH_APP_SECRET,
	consumerKey: process.env.OVH_CONSUMER_KEY
  });

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    app.post('/environment', async function (req, res) {

        console.log(`/POST /environment, body: ${JSON.stringify(req.body)}`);
        
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
              console.log("0");

              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
              return;
            }else{
              current_project = get_res.body;
            }
          } catch (err) {
            console.log("1");

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
  
          console.log("2");
          const cluster_id = current_project.clusters[0];
  
          var new_environment = {};
          new_environment.name = env_name;
          new_environment.branch = branch_name;
          new_environment.custom_domains = [];  
          var subdomain = '';
          if (env_name == 'production'){
            subdomain = current_project.name.toLowerCase();
          }else{
            subdomain = `${current_project.name.toLowerCase()}-${env_name}`;
          }
          new_environment.domains = [`${subdomain}.${domain}`];

          var update = {};
          update.environments = current_project.environments;
          update.environments.push(new_environment);
  
          try {
            const put_res = await superagent.put(Parse.serverURL + '/classes/Project/' + project_id).send(update).set({'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization']}).set('accept', 'json');
            if (put_res.statusCode != 200){
              console.log("3");

              res.statusCode = 401;
              res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
            }
          } catch (err) {
            console.log("4");

            res.statusCode = 401;
            res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
          }

          /*

                //Adding CNAME records for new projects
                var cname_records_amount = environments.length;
                environments.forEach((environment) => {
                    var env_name = environment.name.toLowerCase();
                    var subdomain = '';
                    if (env_name == 'production') {
                        subdomain = name.toLowerCase();
                    } else {
                        subdomain = `${name.toLowerCase()}-${env_name}`;
                    }
                    ovh.request('POST', `/domain/zone/${domain}/record`, {
                        fieldType: 'CNAME',
                        subDomain: subdomain,
                        target: cluster_id.toLowerCase() + `.${domain}.`
                    }, function (err, new_record) {
                        if (err != null) {
                            logger.error(`POST /project: Cannot add CNAME record. Response from DNS provider:  ${err}`);
                        } else {
                            logger.info(`POST /project: CNAME record for project: ${service_id} added. Response from DNS provider: ${JSON.stringify(new_record)}`);
                        }
                        //Refresh OVH DNS records
                        ovh.request('POST', `/domain/zone/${domain}/refresh`, async function (err, is_refreshed) {
                            if (err != null) {
                                logger.error(`POST /project: Cannot refreshh CNAME record. Response from DNS provider:  ${err}`);
                            } else {
                                logger.info(`POST /project: DNS record for project: ${service_id} has been refreshed`);
                            }
                            cname_records_amount = cname_records_amount - 1;
                            if (cname_records_amount == 0) {
                                try {
                                    //Deploy a container with a new service
                                    //await superagent.post(`https://${cluster_id.toLowerCase()}.${domain}/service`).send({ "service_id": service_id }).set({ 'authorization': req.headers['authorization'] }).set('accept', 'json');
                                    logger.info(`POST /project: Job scheduled: Deployment for project with id: ${service_id}`);
                                } catch (err) {
                                    logger.error(`POST /project: Cannot schedule new job: Deploy project with id: ${service_id}, error: ${err.response.text}, status: ${err.response.status}`);
                                }
                            }
                        });
                    });
                });
                */
  
          //Adding CNAME record for new environment
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
                    console.log("5");

                    res.statusCode = 401;
                    res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized"}));
                    console.log('Invalid token');
                  }
                } catch (err) {
                  console.log(err);
                  console.log("6");

                  res.statusCode = 401;
                  res.end(JSON.stringify({message:"Unable to authenticate you.", id: "unauthorized", add_info:err}));
                }
              });
            });
  
  
          }catch(err){
            console.log(err);
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