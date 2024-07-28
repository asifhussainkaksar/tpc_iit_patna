import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from 'bcryptjs';
import session from "express-session";
import dotenv from "dotenv";
dotenv.config();
const app=express();
const port= process.env.PORT || 3000;
const saltRounds=5;

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));


const db = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect()
.then(() => console.log("Connected to the database"))
  .catch(err => console.error("Connection error", err.stack));



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
















//Admin
app.get("/admin",(req,res)=>{
    res.render("home.ejs", {z : 4});
})


app.get("/admin_form", (req, res)=>{
    res.render("admin_form.ejs");
});


app.post("/submit_admin_form", async (req, res) =>{
    var admin = req.body;
    //console.log(email);
    //console.log(password);

    var y = await db.query("select * from admin where email=$1",[admin.email]);
    if(y.rows.length>0){
        return res.render("admin_form.ejs", {err : "email already exist"});
    }

    await db.query("insert into admin_password (email, password) values ($1, $2)",[admin.email, admin.password]);
    
    bcrypt.hash(admin.password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query(`INSERT INTO admin (email,password) VALUES ($1, $2)`,[admin.email, hash]);
            res.render("home.ejs");
        }
      });
});

app.post("/admin_login", async (req, res)=>{
    var email = req.body.email;
    var password = req.body.password;
    
    var y =await db.query("select * from admin where email=$1",[email]);
    
    if(y.rows.length>0){ 
    var hash_password=y.rows[0].password;
    bcrypt.compare(password, hash_password, (err, result) => {
        if (err) {
            console.error("Error comparing passwords:", err);
        } else {
            if (result) {
            req.session.user_id=y.rows[0].id;
            req.session.role="admin";
            res.render("admin_home.ejs",{e : 1});
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


app.get("/admin_add_student",requireLogin, requireRole("admin"), (req, res) =>{
    res.render("admin_home.ejs",{add_student:1});
});


app.post("/admin_add_student",requireLogin, requireRole("admin"), async (req, res) =>{
    var student = req.body;
    //console.log(student);
    var y = await db.query("select * from students where email=$1",[student.email]);
    if(y.rows.length>0){
        return res.render("admin_home.ejs", {err : "email already exist", add_student:1});
    }
    var password = student.name;
    await db.query("insert into student_password (email, password) values ($1, $2)",[student.email, password]);
    
    bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query(`INSERT INTO students
            (name, email, password, age, mobile, specialisation, semester, percentage10, percentage12, CPI, year, placed)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [student.name, student.email, hash, 21, 1234567891, student.specialisation,
            student.semester, 75, 74, student.CPI, student.year, "No"]
            );
            res.render("home.ejs");
        }
      });
    
});



app.get("/admin_stats",requireLogin, requireRole("admin"), (req, res) =>{
    res.render("admin_home.ejs", {z : 1});
});


app.post("/admin_stats",requireLogin, requireRole("admin"), async (req, res) =>{
    //console.log(req.body.specialisation);
    var branch = req.body.specialisation;
    //console.log(branch);
    
    var total, placed, max_package, min_package, avg_package;
    if(branch=="All"){
    total = await db.query(`SELECT COUNT(*) AS total_students FROM students`);

    placed = await db.query(`SELECT COUNT(DISTINCT student_id) AS placed_students FROM placed`);

    max_package = await db.query(`SELECT MAX(package) AS highest_package FROM placed`);

    min_package = await db.query(`SELECT MIN(package) AS lowest_package FROM placed`);

    avg_package = await db.query(` WITH max_package_per_student AS (
                SELECT student_id, MAX(package) AS max_package
                FROM placed GROUP BY student_id)
                SELECT AVG(max_package) AS average_package
                FROM max_package_per_student;`);
    }
    else{ 
    total = await db.query(`SELECT COUNT(*) AS total_students FROM students
                WHERE specialisation = $1`,[branch]);

    placed = await db.query(`SELECT COUNT(DISTINCT student_id) AS placed_students FROM placed
                JOIN students ON placed.student_id = students.id
                WHERE students.specialisation = $1`,[branch]);

    max_package = await db.query(`SELECT MAX(package) AS highest_package FROM placed
                    JOIN students ON placed.student_id = students.id
                    WHERE students.specialisation = $1`,[branch]);

    min_package = await db.query(`SELECT MIN(package) AS lowest_package FROM placed
                    JOIN students ON placed.student_id = students.id
                    WHERE students.specialisation = $1`,[branch]);

    avg_package = await db.query(` WITH max_package_per_student AS (
                SELECT students.id, MAX(package) AS max_package
                FROM placed JOIN students ON placed.student_id = students.id
                WHERE students.specialisation = $1 GROUP BY students.id)
                SELECT AVG(max_package) AS average_package
                FROM max_package_per_student;`,[branch]);
    }
        var total_students = total.rows[0].total_students || 0;
        var placed_students = placed.rows[0].placed_students || 0;
        var highest_package = max_package.rows[0].highest_package || 0;
        var lowest_package = min_package.rows[0].lowest_package || 0;
        var average_package = avg_package.rows[0].average_package || 0;
        
        res.render("admin_home.ejs", {
            z: 1,
            f: 1,
            total: total_students,
            placed: placed_students,
            max_package: highest_package,
            min_package: lowest_package,
            avg_package: average_package
        });
});


/* The above code is a route handler in a Node.js application using Express framework. It is handling a
GET request to "/admin_students" endpoint. */
app.get("/admin_students",requireLogin, requireRole("admin"), async (req, res)=>{
    var y = await db.query("select * from students");
    var z = await db.query(`SELECT s.name AS student_name,s.email AS student_email,
    s.specialisation AS student_specialisation,c.company_name,c.ctc,c.roles
    FROM placed p JOIN students s ON p.student_id = s.id
    JOIN company c ON p.job_id = c.jobid
    JOIN company_credentials cc ON p.company_id = cc.company_id;`);
    
    //console.log(z.rows);
    res.render("admin_home.ejs",{total_student : y.rows, placed_student : z.rows });
});


app.post("/admin_students",requireLogin, requireRole("admin"), async (req, res)=>{
    var branch = req.body.specialisation;
    //console.log(branch);
    var y = await db.query("select * from students where specialisation=$1",[branch]);
    var z = await db.query(`SELECT s.name AS student_name,s.email AS student_email,
    s.specialisation AS student_specialisation,c.company_name,c.ctc,c.roles
    FROM placed p JOIN students s ON p.student_id = s.id
    JOIN company c ON p.job_id = c.jobid
    JOIN company_credentials cc ON p.company_id = cc.company_id
    where s.specialisation=$1`,[branch]);
    
    //console.log(z.rows);
    res.render("admin_home.ejs",{total_student : y.rows, placed_student : z.rows });
});


app.post("/admin_students_search",requireLogin, requireRole("admin"), async (req, res)=>{
    var search = "%" + req.body.search + "%";
    //console.log(branch);
    var y = await db.query("select * from students where specialisation ilike $1 or name ilike $1",[search]);
    var z = await db.query(`SELECT s.name AS student_name,s.email AS student_email,
    s.specialisation AS student_specialisation,c.company_name,c.ctc,c.roles
    FROM placed p JOIN students s ON p.student_id = s.id
    JOIN company c ON p.job_id = c.jobid
    JOIN company_credentials cc ON p.company_id = cc.company_id
    where s.specialisation ilike $1 or s.name ilike $1`,[search]);
    
    //console.log(z.rows);
    res.render("admin_home.ejs",{total_student : y.rows, placed_student : z.rows });
});



app.get("/admin_add_company",requireLogin, requireRole("admin"), (req, res)=>{
    res.render("admin_home.ejs",{add_company : 1});
});


app.post("/admin_add_company",requireLogin, requireRole("admin"), async (req, res)=>{
    var company = req.body;
    //console.log(company);
    
    var y = await db.query("select * from company_credentials where email=$1",[company.email]);
    if(y.rows.length>0){
        return res.render("admin_home.ejs", {err : "email already exist"});
    }
    
    var password = company.name;
    await db.query("insert into company_password (email, password) values ($1, $2)",[company.email, password]);
    
    bcrypt.hash(password, saltRounds, async (err, hash) => {
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


app.post("/admin_delete_student/:id", requireLogin, requireRole("admin"), async (req, res)=>{
    var id = req.params.id;
    //console.log("my name is khan");
    await db.query("delete from students where id = $1",[id]);
    await db.query("delete from student_password where id=$1",[id]);
    res.redirect("/admin_students");
});



app.get("/admin_company",requireLogin, requireRole("admin"), async (req, res)=>{
    var y = await db.query("select * from company_credentials");
    res.render("admin_home.ejs",{company : y.rows});
});


app.get("/admin_company_jobs/:id",requireLogin, requireRole("admin"), async (req, res) =>{
    var company_id=req.params.id;
    //console.log(id);
    var z = await db.query("select * from company where company_id=$1",[company_id]);
    var result=z.rows;
    var x = await db.query("select * from company_credentials");

    //console.log(max_pack);
    res.render("admin_home.ejs", {jobs : result, company: x.rows});
});


app.get("/admin_company_delete/:id",requireLogin, requireRole("admin"), async (req, res) =>{
    var company_id=req.params.id;
    //console.log(company_id);
    await db.query("delete from company_credentials where company_id=$1",[company_id]);
    res.redirect("/admin_company");
});


app.get("/admin_job_delete/:id",requireLogin, requireRole("admin"), async (req, res) =>{
    var job_id=req.params.id;
    //console.log(job_id);
    await db.query("delete from company where jobid=$1",[job_id]);
    res.redirect("/admin_company");
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
    //console.log(company_id);
    //console.log(student_id);*/

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
            age = $1, mobile = $2, percentage10 = $3, percentage12 = $4, placed = $5 WHERE id = $6`,
            [stud.age, stud.mobile, stud.percentage10, stud.percentage12, stud.placed, id]);

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



app.get("/student_forget",requireLogin, requireRole("student"), async (req, res) =>{
    res.render("student_home.ejs",{forget_password : 1});
});


app.post("/student_forget",requireLogin, requireRole("student"), async (req, res) =>{
    var password = req.body.password;
    var confirm_password = req.body.confirm_password;
    //console.log(password);
    //console.log(confirm_password);
    if(password!=confirm_password){
        return res.render("student_forget.ejs",{err : "password and confirm password are not same"});
    }
    
    var id = req.session.user_id;
    await db.query("update student_password set password=$1 where id=$2",[password, id]);
    
    bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query("update students set password=$1 where id=$2",[hash, id]);
            var y = await db.query("select * from students where id = $1",[id]);
            res.render("student_home.ejs",{student : y.rows});
        }
      });
    //res.render("student_forget.ejs");
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
            res.render("company_home.ejs",{id : y.rows[0].company_id, e:1, company_name : y.rows[0].name});
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



app.post("/company_shortlist/:id",requireLogin, requireRole("company"), async (req, res) =>{
    var company_id = req.session.user_id;
    var job_id = req.params.id;
    var branch = req.body.branch;
    branch = branch.toLowerCase();
    var cpi = req.body.cpi;
    //console.log(company_id);
    //console.log(job_id);
    //console.log(branch);
    //console.log(cpi);
    
    var z;
    if(branch!="all"){ 
    z = await db.query(`SELECT 
        s.id, s.name, s.email, s.mobile, s.specialisation, s.cpi, s.percentage10, s.percentage12
        FROM students s JOIN student_applied sa
        ON s.id = sa.student_id
        WHERE sa.company_id = $1 AND sa.job_id = $2 AND lower(s.specialisation) = $3 AND s.cpi>=$4`
        ,[company_id, job_id, branch, cpi]);
        //console.log(z.rows);
    }
    else{
        z = await db.query(`SELECT 
            s.id, s.name, s.email, s.mobile, s.specialisation, s.cpi, s.percentage10, s.percentage12
            FROM students s JOIN student_applied sa
            ON s.id = sa.student_id
            WHERE sa.company_id = $1 AND sa.job_id = $2 AND s.cpi>=$3`
            ,[company_id, job_id, cpi]);
    }
    
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



app.get("/company_forget", requireLogin, requireRole("company"), async (req, res) =>{
        var id = req.session.user_id;
        res.render("company_home.ejs",{id : id, company_forget : 1});
});



app.post("/company_forget", requireLogin, requireRole("company"), async (req, res) =>{
    var password = req.body.password;
    var confirm_password = req.body.confirm_password;
    var id = req.session.user_id;
    //console.log(password);
    //console.log(confirm_password);
    if(password!=confirm_password){
        return res.render("company_home.ejs",{id : id, err : "password and confirm password are not same", company_forget:1});
    }
    
    var e = await db.query("select * from company_credentials where company_id=$1",[id]);
    await db.query("update company_password set password=$1 where email=$2",[password, e.rows[0].email]);
    
    bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
            console.error("Error hashing password:", err);
        } else {
        //console.log("Hashed Password:", hash);
            await db.query("update company_credentials set password=$1 where company_id=$2",[hash, id]);
            var y = await db.query("select * from company_credentials where  company_id = $1",[id]);
            res.render("company_home.ejs",{id : id, company_name:y.rows[0].name, e:1});
        }
      });
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

app.get("/alumni_all",requireLogin, requireRole("alumni"), async (req, res)=>{
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