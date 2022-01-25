/*
    config.js
    Methods for managing events
*/

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    //Get config (public ssh key of a Deployed server)
    app.get('/config', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
        if (logged_user == null) {
            return;
        }
        res.statusCode = 200;
        res.end(JSON.stringify(process.env.PUBLIC_SSH_KEY));
    });
}