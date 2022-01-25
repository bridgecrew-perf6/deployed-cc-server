const polka = require('polka');
const app = polka();

const dotenv = require('dotenv');
dotenv.config();

const { json } = require('body-parser');
const cors = require('cors');

app.use(cors());
app.use(json());

//Create routes
require("./routes/cluster")(app);
require("./routes/config")(app);
require("./routes/domain")(app);
require("./routes/environment")(app);
require("./routes/event")(app);
require("./routes/health")(app);
require("./routes/payment")(app);
require("./routes/project")(app);

//Start provision queue
const provision = require("./internal/provision");
setInterval(provision.provisionNextClient, process.env.CHECK_PROVISION_QUEUE_INTERVAL);

//Start client monitoring queue
const monitoring = require("./internal/client_monitoring");
setInterval(monitoring.getServerStats, process.env.CHECK_CLIENT_HEALTH_INTERVAL);

app.listen(process.env.PORT, err => {
  if (err) throw err;
  console.log(`> Deployed Server is running on port ${process.env.PORT}`);
});
