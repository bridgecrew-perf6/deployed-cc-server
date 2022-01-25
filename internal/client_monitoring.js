/*
    client_monitoring.js
    Methods for client monitoring
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseMasterKey = process.env.PARSE_MASTER_KEY;
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const domain = process.env.SERVER_DOMAIN;

var is_checking_servers = false;

function getServerStats() {
    if (is_checking_servers == true) {
        return;
    }
    is_checking_servers = true;
    checkServers();
}

async function checkServers() {
    try {
        const projects_res = await superagent.get(Parse.serverURL + '/classes/Cluster').query({ order: "-createdAt" }).set({ 'X-Parse-MASTER-Key': ParseMasterKey, 'X-Parse-Application-Id': ParseAppId }).set('accept', 'json');
        console.log("checkServers: request /Project, status code: " + projects_res.statusCode);
        if (projects_res.statusCode != 200) {
            console.error("checkServers: request /Project, status code: " + projects_res.statusCode);
            return;
        } else {
            projects_res.body.results.forEach(async (cur_cluster) => {
                try {
                    const stats_res = await superagent.get(`https://${cur_cluster.objectId.toLowerCase()}.${domain}/stats/${cur_cluster.hook_key}`).set('accept', 'json');
                    console.log("checkServers: request /stats, status code: " + stats_res.statusCode);
                    if (stats_res.statusCode != 200) {
                        console.error("checkServers: request /stats, status code: " + stats_res.statusCode);
                    } else {
                        var stats = JSON.parse(stats_res.text);
                        //Update stats in Cluster object
                        try {
                            const put_res = await superagent.put(Parse.serverURL + '/classes/Cluster/' + cur_cluster.objectId).send({ "stats": stats }).set({ 'X-Parse-MASTER-Key': ParseMasterKey, 'X-Parse-Application-Id': ParseAppId }).set('accept', 'json');
                            if (put_res.statusCode == 200) {

                            } else {
                                console.error(`checkServers: request PUT ParseServer /Cluster, status code: ${stats_res.statusCode}, cannot update cluster`);
                            }
                        } catch (err) {
                            console.error(`checkServers: request PUT ParseServer /Cluster: ` + err);
                        }
                    }
                } catch (err) {
                    console.error(`checkServers: request PUT /stats:` + err);
                }
            });
        }
        is_checking_servers = false;
    } catch (err) {
        is_checking_servers = false;
        console.error(err);
    }
}

module.exports = { getServerStats };
