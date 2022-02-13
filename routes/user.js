/*
    user.js
    Methods for managing users
*/
const superagent = require('superagent');
const cookie = require('cookie');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const keygen = require('ssh-keygen');

const Auth = require("./auth");
const auth = new Auth();

module.exports = function (app) {

    /*
        Create a new user
    */
    app.post('/register', async function (req, res) {
        const email = req.body.email;
        const password = req.body.password;

        keygen({
            comment: email,
            read: true,
            destroy: true
        }, async function (err, keygen_keys) {
            if (err) {
                //Cannot generate new private/public keys
                res.statusCode = 500;
                res.end(JSON.stringify({ message: `Unexpected server-side error: ${err}`, id: "server_error" }));
                console.log('ERROR: POST /register, ' + err);
                return;
            }
            try {
                //Create a new user
                const create_user_req = await superagent.post(Parse.serverURL + '/users').send({ username: email, email:email, password: password, hook_key: hook_key, priv_key: keygen_keys.key, pub_key: keygen_keys.pubKey }).set({ 'X-Parse-Application-Id': ParseAppId }).set('accept', 'json');
                const new_user_id = create_user_req.body.objectId;
                const ACL = { "*": {}};
                ACL[new_user_id] = { "read": true, "write": true };
                try {
                    //Update ACL for this new user
                    await superagent.put(Parse.serverURL + `/users/${new_user_id}`).send({ACL: ACL}).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': create_user_req.body.sessionToken }).set('accept', 'json');
                    res.statusCode = 201;
                    res.setHeader('Set-Cookie', cookie.serialize('sessionToken', String(create_user_req.body.sessionToken), {
                        httpOnly: true,
                        maxAge: 60 * 60 * 24 * 7 * 20 // 20 weeks
                      }));
                    res.end(JSON.stringify({ sessionToken: create_user_req.body.sessionToken }));
                } catch (err) {
                    //Cannot update ACL for a new user
                    res.statusCode = err.response.status;
                    res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
                    return null;
                }
            } catch (err) {
                //Cannot create a new user
                res.statusCode = err.response.status;
                res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
                return null;
            }
        });
    });

    /*
       Login a user
    */
    app.post('/login', async function (req, res) {
        const email = req.body.email;
        const password = req.body.password;
        console.log(email);
        try {
            const create_user_req = await superagent.post(Parse.serverURL + '/login').send({ username: email, password: password }).set({ 'X-Parse-Application-Id': ParseAppId }).set('accept', 'json');
            res.statusCode = create_user_req.status;
            res.setHeader('Set-Cookie', cookie.serialize('authorization', String(create_user_req.body.sessionToken), {
                httpOnly: true,
                /*secure:true,
                SameSite:'none',
                domain:'localhost',*/
                maxAge: 60 * 60 * 24 * 7 * 20 // 20 weeks
              }));
            res.end(JSON.stringify({ sessionToken: create_user_req.body.sessionToken }));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
            return null;
        }
    });

    /*
       Logout a user
    */
       app.post('/logout', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);
		if (logged_user == null) {
			return;
		}
        try {
            const logout_req = await superagent.post(Parse.serverURL + '/logout').send().set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-Session-Token': req.headers['authorization'] }).set('accept', 'json');
            res.statusCode = logout_req.status;
            res.setHeader('Set-Cookie', cookie.serialize('authorization', String(""), {
                httpOnly: true,
                maxAge: 0
              }));
            res.end(JSON.stringify(logout_req.body));
        } catch (err) {
            res.statusCode = err.response.status;
            res.end(JSON.stringify({ message: err.response.text, id: "unauthorized" }));
            return null;
        }
    });
}