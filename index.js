import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt, { hash } from "bcrypt";
import session from "express-session";
import dotenv from "dotenv";
dotenv.config();
const app=express();
const port=3000;
const saltRounds=5;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));


const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});
db.connect();



app.use(session({
    secret: 'secret', // Change this to a more secure random string in production
    resave: false,
    saveUninitialized: true
}));



const requireLogin = (req, res, next) => {
    if (req.session.user_id) {
        next(); // User is authenticated, proceed to the next middleware
    } else {
        res.redirect("/"); // Redirect to login page if not authenticated
    }
};


const requireRole = (role) => {
    return (req, res, next) => {
        if (req.session.role === role) {
            next(); // User has the required role, proceed to the next middleware
        } else {
            res.status(403).send("Access denied"); // Forbidden
        }
    };
};


app.get("/", (req, res)=>{
    res.render("home.ejs");
});


app.get("/admin",(req,res)=>{
    res.render("home.ejs", {z : 4});
})


app.post("/admin_login", (req, res)=>{
    var email=req.body.email;
    var password=req.body.password;

    if(email=="asif@gmail.com" && password=="Abcde"){
        res.send("login successfully");
    }
    else{
        res.send("incorrect password or email");
    }
});
















//STUDENT
app.get("/student", (req,res)=>{
    res.render("home.ejs",{z : 1});
});


app.get("/student_form", (req, res) =>{
    res.render("student_form.ejs");
});


app.post("/submit_student_form", async (req, res) =>{
    var student = req.body;
    
    var y = await db.query("select * from students where email=$1",[student.email]);
    if(y.rows.length>0){
        return res.render("student_form.ejs", {err : "email already exist"});
    }

    await db.query("insert into student_password (email, password) values ($1, $2)",[student.email, student.password]);
    
    bcrypt.hash(student.password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query(`INSERT INTO students
            (name, email, password, age, mobile, specialisation, semester, percentage10, percentage12, CPI, year, placed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [student.name, student.email, hash, student.age, student.mobile, student.specialisation,
            student.semester, student.percentage10, student.percentage12, student.CPI, student.year, student.placed]
            );
            res.render("home.ejs");
        }
      });
    
});




app.get("/student_login", (req, res) =>{
    res.render("student_login.ejs");
})



app.post("/student_login", async (req, res) =>{
    var email = req.body.email;
    var password = req.body.password;
    
    var y =await db.query("select * from students where email=$1",[email]);
    
    if(y.rows.length>0){ 
    var result=y.rows[0];
    var hash_password=result.password;
    bcrypt.compare(password, hash_password, (err, result) => {
        if (err) {
            console.error("Error comparing passwords:", err);
        } else {
            if (result) {
            req.session.user_id=y.rows[0].id;
            req.session.role="student";
            res.render("student_home.ejs", {student : y.rows});
            //res.render("home.ejs");
            } else {
            res.send("Incorrect Password");
            }
        }
        });
    }
    else{
        res.send("email not found");
    }

});



app.get("/student_profile",requireLogin, requireRole("student"), async (req, res)=>{
    var id=req.session.user_id;
    var y = await db.query("select * from students where id = $1",[id]);
    res.render("student_home.ejs", {student : y.rows});
});



app.get("/student_company",requireLogin, requireRole("student"), async (req, res)=>{
    var y = await db.query("select * from company_credentials");
    res.render("student_home.ejs",{company : y.rows});
});


app.get("/student_company_jobs/:id",requireLogin, requireRole("student"), async (req, res) =>{
    var company_id=req.params.id;
    var id=req.session.user_id;
    //console.log(id);
    var y= await db.query("select * from students where id = $1", [id]);
    var cpi=y.rows[0].cpi;
    //console.log(y);
    var z = await db.query("select * from company where company_id=$1",[company_id]);
    var result=z.rows;
    var x = await db.query("select * from company_credentials");
    
    var e = await db.query(`select max(package) AS max_package from placed where student_id=$1`,[id]);
    var max_pack=-5;
    if(e.rows.length>0 && e.rows[0].max_package !== null){
        max_pack = e.rows[0].max_package;
    }

    //console.log(max_pack);

    res.render("student_home.ejs", {jobs : result, cpi : cpi, company: x.rows, max_pack : max_pack});
});


app.get("/student_apply/:id1/:id2",requireLogin, requireRole("student"), async(req,res) =>{
    var job_id=req.params.id1;
    var company_id=req.params.id2;
    var student_id=req.session.user_id;
    /*console.log(job_id);
    console.log(company_id);
    console.log(student_id);*/

    var z= await db.query("select * from student_applied where student_id=$1 and company_id=$2 and job_id=$3",[student_id, company_id, job_id]);
    if(z.rows.length>0){
        res.send("you has already applied for the job");
    }
    else{
        await db.query(`insert into student_applied (student_id, company_id, job_id)
            values ($1,$2,$3)`,[student_id, company_id, job_id]);
        res.send("applied successfully");
    }

});


app.get("/jobs_applied",requireLogin, requireRole("student"), async (req, res) =>{
    var student_id = req.session.user_id;
    var z = await db.query(`SELECT 
    c.company_name, 
    c.roles, 
    c.ctc,
    c.interview_mode
    FROM 
    student_applied sa
    JOIN 
    company c ON sa.job_id = c.jobid
    WHERE 
    sa.student_id = $1;`,[student_id]);
    //console.log(z.rows);
    res.render("student_home.ejs", {jobs_applied : z.rows});
});


app.get("/student_alumni",requireLogin, requireRole("student"), async (req, res) =>{
    var y = await db.query("select name, email, company_name, position, location from alumni");
    //console.log(y.rows);
    res.render("student_home.ejs",{alumni : y.rows});
});



app.get("/student_update_profile",requireLogin, requireRole("student"), async (req, res) =>{
    var id=req.session.user_id;
    var y = await db.query("select * from students where id=$1",[id]);
    //console.log(y.rows[0]);
    res.render("student_home.ejs",{z : 1, stud : y.rows[0]});
});

app.post("/student_update_profile",requireLogin, requireRole("student"), async (req, res) =>{
    var stud = req.body;
    var id = req.session.user_id;
    //console.log(stud);
    await db.query(`
            UPDATE students SET 
            name = $1, age = $2, mobile = $3, specialisation = $4, semester = $5, percentage10 = $6, 
            percentage12 = $7, CPI = $8, year = $9, placed = $10 WHERE id = $11`,
            [stud.name, stud.age, stud.mobile, stud.specialisation, stud.semester, 
            stud.percentage10, stud.percentage12, stud.CPI, stud.year, stud.placed, id]);
    res.redirect("/student_profile");
});


app.get("/student_offers",requireLogin, requireRole("student"), async (req, res) =>{
    var id = req.session.user_id;
    var y = await db.query(`SELECT c.company_name, c.roles AS role, c.ctc
            FROM placed p
            JOIN company c ON p.job_id = c.jobid
            JOIN company_credentials cc ON p.company_id = cc.company_id
            WHERE p.student_id = $1;`,[id]);
    res.render("student_home.ejs", {offers : y.rows});
});





















// COMPANY
app.get("/company", (req,res)=>{
    res.render("home.ejs",{z : 2});
});


app.get("/company_form", (req,res) =>{
    res.render("company_form.ejs");
});


app.post("/submit_company_form", async (req,res) =>{
    var company = req.body;
    //console.log(company);
    
    var y = await db.query("select * from company_credentials where email=$1",[company.email]);
    if(y.rows.length>0){
        return res.render("company_form.ejs", {err : "email already exist"});
    }
    
    
    await db.query("insert into company_password (email, password) values ($1, $2)",[company.email, company.password]);
    
    bcrypt.hash(company.password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
        await db.query(`insert into company_credentials
            (email, password, name) values ($1,$2,$3)`,
            [company.email,hash,company.name]);
            res.render("home.ejs");
        }
        });
});



app.get("/company_login", (req,res) =>{
    res.render("company_login.ejs");
});



app.post("/company_login", async (req, res) =>{
    var email = req.body.email;
    var password = req.body.password;
    
    var y =await db.query("select * from company_credentials where email=$1",[email]);
    
    if(y.rows.length>0){ 
    var result=y.rows[0];
    var hash_password=result.password;
    bcrypt.compare(password, hash_password, (err, result) => {
        if (err) {
            console.error("Error comparing passwords:", err);
        } else {
            if (result) {
            //res.send("login successfully")
            req.session.user_id=y.rows[0].company_id;
            req.session.role="company";
            res.render("company_home.ejs",{id : y.rows[0].company_id});
            } else {
            res.send("Incorrect Password");
            }
        }
        });
    }
    else{
        res.send("email not found");
    }
});


app.get("/company_add_jobs/:id", requireLogin, requireRole("company"), (req,res) =>{
    var id = req.params.id;
    var z=1;
    res.render("company_home.ejs",{id : id, z : z});
});


app.post("/submit_job/:id", requireLogin, requireRole("company"), async(req,res)=>{
    var id = req.params.id;
    var job=req.body;
    
    //console.log(id);
    //console.log(job);
    var y = await db.query("select * from company_credentials where company_id=$1",[id]);
    var email = y.rows[0].email;
    var name = y.rows[0].name;

    //console.log(name);
    //console.log(email);
    //console.log(job);

    await db.query(`insert into company 
                    (email,company_name, minimum_cpi, roles, ctc, interview_mode,company_id)
                    values($1, $2, $3, $4, $5, $6, $7)`,
                [email, name, job.minimum_cpi, job.roles, job.ctc, job.interview_mode, id]);
    
    res.render("company_home.ejs",{id: id});
});


app.get("/company_jobs_applied/:id", requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.params.id;
    //console.log(company_id);
    var y = await db.query("select * from company where company_id = $1",[company_id]);
    res.render("company_home.ejs", {id : company_id, jobs : y.rows});
});


app.get("/company_students_applied/:id1/:id2", requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.params.id1;
    var job_id = req.params.id2;

    var z = await db.query(`SELECT 
    s.id, s.name, s.email, s.mobile, s.specialisation, s.cpi, s.percentage10, s.percentage12
    FROM students s JOIN student_applied sa
    ON s.id = sa.student_id
    WHERE sa.company_id = $1 AND sa.job_id = $2`,[company_id, job_id]);
    //console.log(z.rows);

    var y = await db.query("select * from company where company_id=$1",[company_id]);
    res.render("company_home.ejs", {student : z.rows, id : company_id, jobs : y.rows, job_id : job_id});
});


app.get("/company_jobs_added",requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.session.user_id;
    var y = await db.query("select * from company where company_id=$1", [company_id]);
    res.render("company_home.ejs", {id: company_id, job1 : y.rows});
});


app.get("/company_placed/:id1/:id2",requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.session.user_id;
    var student_id = req.params.id1;
    var job_id = req.params.id2;
    //console.log(student_id);
    //console.log(job_id);
    
    var y = await db.query("select * from placed where student_id=$1 and company_id=$2 and job_id=$3",[student_id, company_id, job_id]);

    if(y.rows.length>0){
        res.send("already selected");
    }
    else{ 
    var year = new Date().getFullYear();
    var z = await db.query("select * from company where company_id = $1 and jobid=$2",[company_id, job_id]);
    var pack = z.rows[0].ctc;
    await db.query(`insert into placed (student_id, company_id, job_id, year, package)
                    values ($1, $2, $3, $4, $5)`,
                    [ student_id, company_id, job_id, year, pack]);
    
    var e = await db.query(`select max(package) AS max_package from placed where student_id=$1`,[student_id]);
    var max_pack=-5;
    if(e.rows.length>0 && e.rows[0].max_package !== null){
        max_pack = e.rows[0].max_package;
    }  
    
    await db.query( `DELETE FROM student_applied WHERE student_id = $1 AND job_id IN (
                    SELECT jobid FROM company WHERE ctc < $2)`,[student_id, max_pack+5]);
    
    res.redirect("/company_selected");
    //res.render("company_home.ejs", {id : company_id});
    }
});



app.get("/company_selected", requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.session.user_id;
    var y = await db.query(`select s.name, s.email, s.specialisation, s.mobile, c.roles, c.ctc
                            from placed as p join students as s on s.id = p.student_id
                            join company as c on c.jobid = p.job_id
                            where p.company_id=$1`, [company_id]);
    //console.log(y.rows);
    res.render("company_home.ejs", {id : company_id, selected : y.rows});
});




















//ALUMNI
app.get("/alumni", (req, res)=>{
    res.render("home.ejs",{z : 3});
});

app.get("/alumni_form",(req, res) =>{
    res.render("alumni_form.ejs");
});


app.post("/submit_alumni_form", async (req,res)=>{
    //console.log(req.body);
    var alumni = req.body;
    //console.log(alumni);
    //console.log(company);

    var y = await db.query("select * from alumni where email=$1",[alumni.email]);
    if(y.rows.length>0){
        return res.render("alumni_form.ejs", {err : "email already exist"});
    }
    

    await db.query("insert into alumni_password (email, password) values ($1, $2)",[alumni.email, alumni.password]);
    
    bcrypt.hash(alumni.password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query(`insert into alumni
            (email, password, name, company_name, ctc, area, position, location, working_tenure)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [alumni.email,hash,alumni.name,alumni.company_name,alumni.ctc,alumni.area,
            alumni.position,alumni.location,alumni.working_tenure]);
            res.render("home.ejs",{z: 3});
        }
        });
        

});


app.get("/alumni_login", (req, res) =>{
    res.render("alumni_login.ejs");
});


app.post("/alumni_login", async (req, res) =>{
    var email = req.body.email;
    var password = req.body.password;
    
    var y =await db.query("select * from alumni where email=$1",[email]);
    
    if(y.rows.length>0){ 
    var result=y.rows[0];
    var hash_password=result.password;
    bcrypt.compare(password, hash_password, (err, result) => {
        if (err) {
            console.error("Error comparing passwords:", err);
        } else {
            if (result) {
                req.session.user_id=y.rows[0].id;
                req.session.role="alumni";
            res.render("alumni_home.ejs",{profile : y.rows[0]});
            //res.render("home.ejs");
            } else {
            res.send("Incorrect Password");
            }
        }
        });
    }
    else{
        res.send("email not found");
    }
});



app.get("/alumni_profile",requireLogin, requireRole("alumni"), async (req, res) =>{
    var id = req.session.user_id;
    var y = await db.query("select * from alumni where id=$1",[id]);
    res.render("alumni_home.ejs", {profile: y.rows[0]});
});

app.get("/alumni_all", async (req, res)=>{
    var y = await db.query("select * from alumni");
    res.render("alumni_home.ejs",{alumni : y.rows});
})

app.get("/alumni_companies",requireLogin, requireRole("alumni"), async (req, res) =>{
    var y = await db.query("select * from company_credentials");
    res.render("alumni_home.ejs", {company : y.rows});
});

app.get("/update_alumni",requireLogin, requireRole("alumni"), async(req, res) =>{
    var id = req.session.user_id;
    var y = await db.query("select * from alumni where id = $1",[id]);
    res.render("alumni_home.ejs",{z : 1, alum : y.rows[0]});
});

app.post("/update_alumni",requireLogin, requireRole("alumni"), async(req, res) =>{
    var alum = req.body;
    //console.log(alum);
    await db.query(`update alumni set name=$1, company_name=$2, ctc=$3, area=$4,
                position=$5, location=$6, working_tenure=$7`,
                [alum.name, alum.company_name, alum.ctc, alum.area,
                alum.position,alum.location,alum.working_tenure]);
    res.redirect("/alumni_profile");
});




app.get("/log_out", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
            res.status(500).send("An error occurred while logging out");
        } else {
            res.redirect("/"); // Redirect to login page or home page after logout
        }
    });
});


app.listen(port, (req,res)=>{
    console.log(`i am listening in port ${port}`);
});