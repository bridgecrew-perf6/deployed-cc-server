/*
	auth.js
	Methods for checking sessions
*/
const superagent = require('superagent');
const cookie = require('cookie');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.serverURL = process.env.PARSE_SERVER_URL;

class Auth {

    async handleAllReqs(req, res) {
        //Check if a request has a valid session cookie
        //Session cookie has priority over a session token in headers
        var cookies = cookie.parse(req.headers.cookie || '');
        var token = cookies.authorization;
        if (token == undefined){
            //Looks like this request hasn't session cookie, let's check if a request has a token in headers
            token = req.headers['authorization'];
            //If there is no token in headers return 401 error
            if (token == undefined){
                res.statusCode = 401;
                res.end(JSON.stringify({ message: "Unable to authenticate you.", id: "unauthorized" }));
                return null;
            }
        }else{
            //Add a token from cookies to request headers, we need it later for some requests
            req.headers['authorization'] = token;
        }
        //Check if a token is valid and get a user by token, restrict fields in the response
        try {
            const get_me_req = await superagent.get(Parse.serverURL + '/users/me').query({keys:"email" }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': token }).set('accept', 'json');
            return get_me_req.body;
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
            return null;
        }
    }

}
module.exports = Auth;