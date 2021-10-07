require('dotenv').config({path:'../../.env'});
var mongoose = require('mongoose');
const uri = "mongodb+srv://OneBuckAid:"+process.env.DB_KEY+"@cluster0.9k2jo.mongodb.net/donorlist?retryWrites=true&w=majority";

const connectDB = ()=>{
    mongoose.connect(uri,{ useNewUrlParser: true, useUnifiedTopology:true}).then(()=>{
        console.log("database connected");
      }).catch((err)=>{console.log(err)});
    
}
module.exports.uri=uri;
module.exports.connection=connectDB();
