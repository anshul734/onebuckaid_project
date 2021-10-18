require('dotenv').config({ path: '../.env' });
var express = require('express')
var mongoose = require('mongoose');
var bodyParser = require('body-parser');//for reading data from form body
var cors = require('cors')
var session = require('express-session');//for session storage
var path = require('path');
var passport = require('passport');
var MongoStore = require('connect-mongo');//to store sessions in mongo database
var FacebookStrategy = require('passport-facebook').Strategy;//Strategy for facebook login
var GoogleStrategy = require('passport-google-oauth20').Strategy;//Strategy for google login
var LocalStrategy = require('passport-local').Strategy;//Strategy for local login through email & username
var database = require('./config/connect');//module contains uri and mongodb connection
var donor = require('./models/donor_model');//module contains donor schema and model
var receiver = require('./models/receiver_model');//module contains recipient schema and model
const flash = require('connect-flash');//package to send authentication messages
let uri = database.uri;//mongo atlas uri
database.connection;//establishes connection
const port=process.env.PORT || 8000;
var app = express()
const staticPath = path.join(__dirname, "public");//path to static folder
const templatePath=path.join(__dirname,"views");
app.use(cors());
app.set('view engine', 'hbs');//for using hbs templates
app.set('views',templatePath);
app.use(session({
    secret: process.env.SES_KEY, 
    resave: false,//session store will not be modified if req.session object is not changed
    saveUninitialized: true,//session will be stored even if req.session is not set
    store: MongoStore.create({ mongoUrl: uri, collection: 'sessions' }),//stores the session in database
    cookie: { maxAge: 1000 * 60 * 60 * 24 }//expiration date for session
}))
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(staticPath));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//code for serialization and deserialization of user.
passport.serializeUser(function (user, done) {
    done(null, user.userid);//serializes user through userid
})
//code for deserializtion of user 
passport.deserializeUser(function (id, done) {
    donor.findOne({ userid: id }, (err, user) => {
        done(err, user);
    })

})
//code for facebook login
passport.use(new FacebookStrategy({
    clientID: process.env.FB_CLIENT_ID,
    clientSecret: process.env.FB_CLIENT_SECRET,
    callbackURL: "https://onebuckaid.herokuapp.com/auth/facebook/callback",//url where the facebook will redirect if successful authorisation
    profileFields: ['id', 'displayName', 'photos', 'emails'] //fields we require
},
    function (accessToken, refreshToken, profile, done) {
       
        donor.findOne({ userid: profile.id }, async (err, user) => {
            if (user) {//if user already in database
                
                return done(null, user);
            }
            else {//esle create user in database
                try {
                    let obj = {};
                    obj.name = profile.displayName;
                    obj.userid = profile.id.toString();
                    if(profile.emails){
                    obj.email = profile.emails[0].value;}
                    obj.photo = "https://graph.facebook.com/" + profile.id + "/picture" + "?width=200&height=200" + "&access_token=" + accessToken;
                    let user = new donor(obj);
                    let result = await user.save();
                    done(null, result);
                } catch (err) {
                    console.log(err);
                    done(err);
                }
            }
        })
    }));

app.get("/auth/facebook", passport.authenticate('facebook', { scope: ['email'] }));//scope:email to be included for getting user email if publicaly available
app.get("/auth/facebook/callback", passport.authenticate('facebook', {
    successRedirect: '/',
    failureRedirect: '/loginpage'
}));
//code for facebook login ends here

//code for google login
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://onebuckaid.herokuapp.com/auth/google/callback"
},
    function (accessToken, refreshToken, profile, done) {
        donor.findOne({ userid: profile.id }, async (err, user) => {
            if (user) {//if user already present in database
                return done(null, user);
            }
            else {//else create new user in database
                try {
                    let obj = {};
                    obj.name = profile.displayName;
                    obj.userid = profile.id.toString();
                    obj.photo = profile.photos[0].value;
                    obj.email = profile.emails[0].value;
                    let user = new donor(obj);
                    let result = await user.save();
                    done(null, result);
                } catch (err) {
                    console.log(err);
                    done(err);
                }
            }
        })
    }
));
app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/loginpage' }),
    function (req, res) {
        // Successful authentication, redirect home.
        res.redirect('/');
    });
// code for google login ends here

//code for local login starts here
passport.use(new LocalStrategy({
    usernameField: 'username',//important to set beacuse passport only recognises username and password keyword
    passwordField: 'email'//setting password field as email (req.body.email)
},
    function (username, password, done) {
        donor.findOne({ email: password }, async function (err, user) {
            if (err) {
                console.log(err)
                return done(err);
            }
            if (!user) {//if no user create user in database
                let obj = {
                    name: username,
                    email: password
                };
                let user1 = new donor(obj);
                user = await user1.save();
                //populating userid field with _id field of already created user
                let id = user._id;
                user = await donor.findOneAndUpdate({ _id: id }, { $set: { userid: id } }, { new: true });
                return done(null, user);
            }
            if (!(user.name == username)) {//checking if username and email match
                
                return done(null, false,{message:"A user exist with given email address"});//message can be used in req.flash in api
            }
            else {//if user already exist
                return done(null, user);
            }
        });
    }
));

app.post('/login',
    passport.authenticate('local',{ successRedirect: '/',
    failureRedirect: '/loginpage',failureFlash:true }));//setting failureFlash:true for accessing message on authentication failure
//code for local login ends here

//code for authentication 
function isAuthenticated(req, res, done) {//A custom middleware to check if user is authenticated
    if (req.user) return done();//if req.user exist authentication was completed
    else return res.redirect("/loginpage");
}
//A helper function to count no.of donations made
async function totalusercounts(){
    let result =await donor.find({},'usercount');
    return result;
}


app.get("/", isAuthenticated, async(req, res) => {
    let communitycount=0;
    await totalusercounts().then((users)=>{
        for(let i=0;i<users.length;i++){
            communitycount=communitycount+users[i].usercount;
        }
    })
    res.render('home', {
        style: "style2.css",
        image1: "onebuckaidlogo.png",
        image2: "loader.jpeg",
        userphoto: req.user.photo || 'images/guestuser.png',
        username: req.user.name,
        usercount: req.user.usercount,
        communitycount: communitycount
    });
})


app.get("/loginpage", (req, res) => {
    const error=req.flash('error')[0]||'';
    res.render('loginpage', {
        style: "style1.css",
        error:error,
        image1:"onebuckaidlogo.png",
        image2:"loader.jpeg"
    });
})
//A helper function to retrieve receiver collection from database
async function findlist(key_value){
    let result =await receiver.find(key_value);
    return result;
}

app.get("/receiver", isAuthenticated, (req, res) => {

   findlist({}).then((users)=>{//As findlist is a async function we have to use .then()
       let len=users.length;
       code_trending=``;
       code_other=``;
       //dynamically inserting html based on data in database
       for(let i=0;i<len;i++){
           if(users[i].trending==true){
               var code_trending=code_trending+`<div class="card" id=${users[i]._id}>
               <img src="images/receiver/${users[i].photo}" class="card-img-top" alt="...">
               <div class="card-body">
                   <p class="card-title">${users[i].name}</p>
                   <a href="/${users[i]._id}" class="btn btn-primary" style="background-color:rgb(250,170,21);">Donate</a>
               </div>
           </div>`
           }
           else{
               var code_other=code_other+`<div class="card" id=${users[i]._id}>
               <img src="images/receiver/${users[i].photo}" class="card-img-top" alt="...">
               <div class="card-body">
                   <p class="card-title">${users[i].name}</p>
                   <a href="/${users[i]._id}" class="btn btn-primary" style="background-color:rgb(250,170,21);">Donate</a>
               </div>
           </div>`
           }
       }
       res.render('receiver', {
        style: "style3.css",
        image1: "onebuckaidlogo.png",
        image2: "trending.gif",
        image3: "other.gif",
        image4: "PMCare.jpeg",
        image5:"loader.jpeg",
        code1:code_trending,
        code2:code_other
    
    })
   })
})
app.get("/history",isAuthenticated,async(req,res)=>{
    var code=``;
    if(req.user.history.length==0)//if no donations have been made
    {
        code=`<h1 style="color:silver">No History</h1>`
    }
    else{
        code=`<tr>
        <th>SI No.</th>
        <th>Date</th>
        <th>Recipient Name</th>
        <th>Amount</th>
        </tr>`
       await findlist({}).then((users)=>{
            for(let i=0;i<req.user.history.length;i++){
              var id=req.user.history[i].id;
              var name='';
              for(let j=0;j<users.length;j++){
                 if(users[j]._id==id){
                   name=users[j].name;
                 }
              }
                code=code+`<tr>
                <td>${i+1}</td>
                <td>${req.user.history[i].date}</td>
                <td>${name}</td>
                <td>&#x20B9;1</td>
              </tr>`
            }
        })
    }
    res.render('history',{
        style:"style4.css",
        image1:"loader.jpeg",
        image2:"onebuckaidlogo.png",
        code1:code
    })
})
//public privacy policy endpoint
app.get("/publicprivacypolicy",(req,res)=>{
    res.render('privacypolicy',{image1:"onebuckaidlogo.png"});
})
app.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/loginpage");
})
//apis to handle if any donation is made.
app.get('/61569f79a77178b9eb636a76',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'61569f79a77178b9eb636a76',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a3516a8aea053d98673b',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a3516a8aea053d98673b',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a4238df3163f1d515395',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a4238df3163f1d515395',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a4ad6c61201d0ec834b8',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a4ad6c61201d0ec834b8',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a61279fe077a1b19f68b',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a61279fe077a1b19f68b',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a6788cd4de740c14b947',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a6788cd4de740c14b947',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})
app.get('/6156a6ef56b2f7db2bea1b92',async(req,res)=>{
    let d = new Date();
    d=d.toDateString();
    let obj={
        id:'6156a6ef56b2f7db2bea1b92',
        date:d
    }
    let arr=req.user.history;
    arr.push(obj);
    count=req.user.usercount+1;
    const update={history:arr,usercount:count};
    const user=await donor.findOneAndUpdate({_id:req.user._id},update,{new:true});
    res.redirect('/receiver');
    res.end();
})

app.listen(port, () => {
    console.log("listening on port 8000");
})


