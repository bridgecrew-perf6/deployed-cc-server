/*
    payment.js
    Methods for managing payments
*/
const superagent = require('superagent');

const Parse = require('parse/node');
const ParseAppId = process.env.PARSE_APP_ID;
Parse.initialize(ParseAppId);
Parse.serverURL = process.env.PARSE_SERVER_URL;

const Auth = require("./auth");
const auth = new Auth();

//Payments
const stripe_test = require('stripe')(process.env.STRIPE_TEST_PRIVATE_KEY);
const stripe_live = require('stripe')(process.env.STRIPE_LIVE_PRIVATE_KEY);

module.exports = function (app) {

    //Payments
    app.post('/matilde_event', async function (req, res) {
        const event = req.body;
        console.log(req.body);

        let subscription;
        let status;
        let metadata = req.body.data.object.metadata;
        console.log("Metadata: " + metadata);

        // Handle the event
        switch (event.type) {
            case 'customer.subscription.trial_will_end':
                subscription = event.data.object;
                status = subscription.status;
                console.log(`Subscription status is ${status}.`);
                // Then define and call a method to handle the subscription trial ending.
                // handleSubscriptionTrialEnding(subscription);
                break;
            case 'customer.subscription.deleted':
                subscription = event.data.object;
                status = subscription.status;
                console.log(`Subscription status is ${status}.`);
                // Then define and call a method to handle the subscription deleted.
                // handleSubscriptionDeleted(subscriptionDeleted);
                break;
            case 'customer.subscription.created':
                subscription = event.data.object;
                status = subscription.status;
                console.log(`Subscription status is ${status}.`);
                subscriptionCreated(metadata);
                // Then define and call a method to handle the subscription created.
                // handleSubscriptionCreated(subscription);
                break;
            case 'customer.subscription.updated':
                subscription = event.data.object;
                status = subscription.status;
                console.log(`Subscription status is ${status}.`);
                // Then define and call a method to handle the subscription update.
                // handleSubscriptionUpdated(subscription);
                break;
            default:
                // Unexpected event type
                console.log(`Unhandled event type ${event.type}.`);
        }

        try {
            const stripe_id = req.body.data.object.id;
            const get_res = await superagent.get(Parse.serverURL + '/classes/Subscription').send({ where: { stripeId: stripe_id } }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
            if (get_res.statusCode == 200) {
                if (get_res.body.results.length > 0) {
                    //Subscription is created already
                    //Update it
                    try {
                        const put_res = await superagent.put(Parse.serverURL + '/classes/Subscription/' + get_res.body.results[0]).send({ "status": event.data.object.status }).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
                        console.log(put_res);
                        if (put_res.statusCode == 200) {


                        } else {

                        }
                    } catch (err) {


                    }

                } else {
                    //Create subscription
                    var new_subscription = {};
                    new_subscription.userId = metadata.user_id;
                    new_subscription.projectId = metadata.project_id;
                    new_subscription.stripeId = stripe_id;
                    new_subscription.status = event.data.object.status;
                    new_subscription.ACL = { "*": {} };
                    const post_res = await superagent.post(Parse.serverURL + '/classes/Subscription').send(new_subscription).set({ 'X-Parse-Application-Id': ParseAppId, 'X-Parse-MASTER-Key': ParseMasterKey }).set('accept', 'json');
                    if (post_res.statusCode != 201) {

                    }
                }

            }

        } catch (error) {
            console.log(error);
        }
        // Return a 200 response to acknowledge receipt of the event
        res.end();
    }
    );

    async function subscriptionCreated(projectParams) {

        var new_project = {};
        new_project.git_url = "";
        new_project.environments = [
            {
                "name": "production",
                "branch": "master",
                "custom_domains": []
            }];
        new_project.name = projectParams.name;
        new_project.port = "2368";
        new_project.runtime = 'ghost';
        new_project.runtime_version = "4.2.3";
        new_project.docker_run_cmd = `docker run -d --restart unless-stopped --name ${new_project.name} -e mail__from=noreply@mx.matilde.cc -e mail__transport=SMTP -e mail__options__host=mx.matilde.cc -e mail__options__port=587 -e mail__options__service=SMTP -e mail__options__auth__user=matilde -e mail__options__auth__pass=Ddj7J5GAMmVb2ZASsnv3Xf3kfg -e url=https://${new_project.name.toLowerCase()}.matilde.cc -p {{cluster_port}}:2368 ghost`;
        new_project.project_id = projectParams.project_id;
        new_project.domain = 'matilde.cc';

        //Add this new project to queue
        try {
            const post_res = await superagent.post(`http://localhost:4005/project`).send(new_project).set({ 'authorization': projectParams.token, master_key: ParseMasterKey }).set('accept', 'json');
            if (post_res.statusCode == 200) {
            } else {
                console.log(post_res);
            }
        } catch (err) {
            console.log(err);
        }
        //////////////////////////////////



    }

    app.post('/managed_project', async function (req, res) {
        const logged_user = await auth.handleAllReqs(req, res);

        if (logged_user == null) {
            return;
        }

        var cluster_id = 'gyugWiImJj'; //we should choose needed cluster by a region and available resources

        try {
            const post_res = await superagent.post(`http://localhost:4005/marketplace_app`).send({ cluster_id: cluster_id }).set({ 'authorization': req.headers['authorization'] }).set('accept', 'json');
            if (post_res.statusCode == 201) {
                console.log(`New project created: ${post_res.text}`);
                const new_project_id = JSON.parse(post_res.text).project_id;
                var new_project = {};
                new_project.project_id = new_project_id;
                new_project.user_id = logged_user.objectId;
                new_project.name = req.body.name;
                new_project.token = req.headers['authorization'];

                var stripe = stripe_test;
                var matilde_micro_price_key = 'price_1KCjF8HtasGcXlNCngEYpoID';
                var MATILDE_DOMAIN = 'http://localhost:4141';

                if (req.headers["host"].indexOf('localhost') == -1) {
                    stripe = stripe_live;
                    matilde_micro_price_key = 'price_1KEwogHtasGcXlNC6ro6ScTa';
                    MATILDE_DOMAIN = 'https://matilde.cc';
                }

                //Create Stripe session
                const session = await stripe.checkout.sessions.create({
                    billing_address_collection: 'auto',
                    client_reference_id: logged_user.objectId,
                    line_items: [
                        {
                            price: matilde_micro_price_key,
                            // For metered billing, do not pass quantity
                            quantity: 1,
                        },
                    ],
                    mode: 'subscription',
                    success_url: `${MATILDE_DOMAIN}/me/wow`,
                    cancel_url: `${MATILDE_DOMAIN}/me/ups`,
                    billing_address_collection: 'required',
                    subscription_data: {
                        trial_period_days: 3,
                        metadata: new_project,
                    },
                });

                //Tests
                res.statusCode = 201;
                res.end(JSON.stringify({ result: true, payment: session.url }));

            } else {
                console.log('Invalid token');
                res.statusCode = 403;
                res.end(JSON.stringify({ result: false, error: 'Invalid token' }));
            }
        } catch (err) {
            console.log(err);
        }
    });
}