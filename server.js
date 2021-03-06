/**
 * Created by samlin on 10-May-17.
 */
'use strict';

const db = require('./databaseconnector');
const express = require('express')
const authentication = require('express-authentication');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// public files
app.use('/images', express.static('images'));
app.use(session({ secret: 'turunyliopisto', cookie: { maxAge: 30 * 1000 * 60 }}));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.set('view engine', 'ejs'); // set up ejs for templating
app.use(express.static('public'));

/**
 * Allow CORS requests from other hosts
 */
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

/**
 * Ensure there's always a connection to database when someone is using the system
 */
app.use(function (req, res, next) {
    db.getConnection();
    next();
});

/**
 * Check authentication if trying to access secure page
 */
app.use(function(req, res, next) {
    if (/.*\/admin.*/.test(req.url) && (!req.session || !req.session.adminauthenticated)) {
        res.status(403).send('YOU SHALL NOT PASS');
        return;
    }
    next();
});

/**
 * Serve admin panel
 */
app.get('/admin', function (req, res) {
    res.sendfile('public/adminpanel.html');
});

/**
 * Serve login page
 */
app.get('/login2', function (req, res) {
    res.sendfile('public/login.html');
});

/**
 * Log out, works for both admin and regular user
 */
app.get('/logout', function (req, res) {
    req.session.destroy(); // wipe out session info
    res.redirect('/'); // back to root
});

/**
 * Check regular user authentication
 */
function checkAuth(req) {
    if(!req.session)
        return false;
    return (req.session.authenticated !== null && req.session.authenticated !== undefined);
}

/**
 * Return all movies in database
 */
app.get('/getmovies', function (req, res) {
    db.getMovies((err, result) => {
        res.json(result);
    });
});

/**
 * Root view
 */
app.get('/', function (req, res) {
    function getTheaterName(theaters, theaterId) {
        let resultStr = 'Unknown';
        theaters.forEach((theater) => {
            if(theater.idTheater === theaterId)
                resultStr = theater.name;
        });
        return resultStr;
    }
    db.getMovies(function(err, moviesRes) {
        db.getTheaters(function (err, theatersRes) {
            db.getScreenings(function (err, screeningsRes) {
                db.getAuditoriums(function(err, auditoriumRes) {
                    // give each viewmodel entry the name of the theater
                    screeningsRes.forEach((screening) =>
                    {
                        let idTheater;
                        auditoriumRes.forEach((a) => {
                            if(a.idAuditorium === screening.idAuditorium)
                                idTheater = a.idTheater;
                        });
                        moviesRes.forEach((a) => {
                            if(a.idMovie === screening.idMovie) {
                                screening.idMovie = a.idMovie;
                                screening.moviename = a.title;
                            }
                        });
                        screening.time = screening.time.toISOString().slice(0,10);
                        screening.theaterName = getTheaterName(theatersRes, idTheater);
                        screening.idTheater = idTheater;
                    });

                    if(req.session.authenticated && req.session.authenticated.name !== undefined) {

                        // get user bookings
                        db.getUserBookings(req.session.authenticated.id, function (err, bookingRes) {
                            bookingRes.forEach((b) => {
                                screeningsRes.forEach((a) => {
                                    if(a.idScreening === b.idScreening) {
                                        b.movieName = a.moviename;
                                        b.time = a.time;
                                        b.theaterName = a.theaterName;
                                    }
                                });
                            });
                            console.log(bookingRes + " " + bookingRes.length);
                            res.render('index.ejs', {
                                movies: moviesRes,
                                theaters: theatersRes,
                                user: req.session.authenticated,
                                screenings: screeningsRes,
                                bookings: bookingRes
                            });
                        });
                    } else {
                        res.render('index.ejs', {
                            movies: moviesRes,
                            theaters: theatersRes,
                            user: undefined,
                            screenings: screeningsRes,
                            bookings: []
                        });
                    }
                });
            });
        });
    });
});

/* DATABASE HANDLING STARTS HERE */

/**
 * Get all screenings
 */
app.get('/getscreenings', function(req, res) {
    db.getScreenings((err, result) => {
        res.json(result);
    });
});

app.get('/testi', function(req, res) {
    res.sendfile('backend/public/login2.html');
});

/**
 * Get screenings by date range
 */
app.get('/getscreenings/:datestart/:dateend', function(req, res) {
    db.getScreeningsByDate(req.params.datestart, req.params.dateend, (err, result) => {
        res.json(result);
    });ge
});

/**
 * Get screenings by movie id
 */
app.get('/getmoviescreenings/id/:movieid', function(req, res) {
    db.getMovieScreenings(req.params.movieid, (err, result) => {
        res.json(result);
    });
});

/**
 * Get screenings by movie id and theater id
 */
app.get('/getmoviescreenings/:movieid/:theaterid', function(req, res) {
    db.getScreeningsByTheaterMovie(req.params.movieid, req.params.theaterid, (err, result) => {
        res.json(result);
    });
});

/**
 * Get reserved seats
 */
app.get('/reservedseats/:screeningid', function(req, res) {
    db.getReservedSeats(req.params.screeningid, (err, result) => {
        res.json(result);
    });
});

app.get('/seats/:screeningid', function(req, res) {
    // get
    db.getScreening(req.params.screeningid, (err, result) => {
        if(err) {
            res.json({status: 'failed'});
            return;
        }
        // get auditorium seats
        db.getAuditoriumSeats(result[0].idAuditorium, (err, seats) => {
            db.getReservedSeats(req.params.screeningid, (err, reservedSeats) => {
                let _resId = [];
                for (let i = 0; i < reservedSeats.length; i++) {
                    _resId.push(reservedSeats[i].idSeat);
                }
                for (let i = 0; i < seats.length; i++) {
                    seats[i].reserved = _resId.includes(seats[i].idSeat);
                }
                res.json(seats);
            });
        });
    });
});

/**
 * Get user's bookings
 */
app.get('/booking', function(req, res) {
    if(checkAuth(req)) {
        db.getUserBookings(req.session.authenticated.id, (err, result) => {
            res.json(result);
        });
    } else {
        res.status(401).send('Unauthorized');
    }
});

/**
 * Delete booking
 */
app.get('/booking/delete/:id', function(req, res) {
    if(checkAuth(req)) {
        db.deleteBooking(req.session.authenticated.id, req.params.id ,(err, result) => {
            if(!err)
               res.json({status: result.affectedRows === 1 ? 'OK' : 'failed'});
            else {
                console.error(err);
                res.json({status: 'failed'})
            }
        });
    } else {
        res.status(401).send('Unauthorized');
    }
});

/**
 * Handle a booking request
 */
app.post('/booking/create/', function(req, res) {
    if(checkAuth(req)) {
        console.log(req.session.authenticated.id + " " + req.body.screening + " " + req.body.seat);
        db.createBooking(req.session.authenticated.id, req.body.screening, req.body.seat, (err, result) => {
            if(err) {
                res.json({status: 'failed'});
            } else {
                if(result.affectedRows === 1) {
                    res.json({status: 'OK'});
                } else {
                    res.json({status: 'failed'});
                }
            }
        });
    } else {
        res.status(401).send('Unauthorized');
    }
});

/**
 * Register user
 */
app.post('/register', function(req, res) {
    db.createUser(req.body.name, req.body.email, req.body.pwd, (err, result) => {
        if(err || result.affectedRows !== 1) {
            console.error('User creation failed');
            res.json({status: 'fail'});
        } else {
            console.log('User ' + req.body.name + ' created');
            res.json({status: 'OK'});
        }
    });
});

/**
 * Log in user
 */
app.post('/login', function(req, res) {
    db.authenticateUser(req.body.name, req.body.pwd, function (err, result) {
        if(err) {
            console.error('Login failed');
            res.json({status: 'fail'});
        } else {
            // update session
            req.session.authenticated = {name: result.name, id: result.idUser};
            console.log(result);
            console.log('User ' + result.name + ' Id: ' + result.idUser + ' logged in');
            res.json({status: 'OK'});
        }
    });
});

/**
 * ADMIN METHODS BELOW
 */

/**
 * Handle admin login request
 */
app.post('/login2', function(req, res) {
    if (req.body.user && req.body.user === 'admin' && req.body.pwd && req.body.pwd === 'admin') {
        req.session.adminauthenticated = true;
        res.redirect('/admin');
    } else {
        res.status(401).send('Username and/or password are incorrect');
    }
});

/**
 * Handle admin tool edit requests
 */
app.get('/admin/:request/:method', function (req, res) {
    let response = {};
    let table = req.params.request,
        method = req.params.method;
    switch (table) {
        case 'movies':
            if(method === 'GET') {
                db.getMovies((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.deleteMovie(req.query.id, function() {
                    console.log('Removed movie ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.admin.addMovie(req.query.name, null, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('Movie added to database');
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'screenings':
            if(method === 'GET') {
                db.getScreenings((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.deleteMovie(req.query.id, function() {
                    console.log('Removed screening ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.admin.addScreening(req.query.idMovie, req.query.time, req.query.idAuditorium, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('Screening added to database');
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'theaters':
            if(method === 'GET') {
                db.getTheaters((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.admin.generalQuery("DELETE FROM Theater WHERE idTheater = ?;", [req.query.id], function() {
                    console.log('Removed theater ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.admin.addTheater(req.query.name, null, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('Theater added to database');
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'seats':
            if(method === 'GET') {
                db.getSeats((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.deleteMovie(req.query.id, function() {
                    console.log('Removed seat ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.admin.addSeat(req.query.row, req.query.number, req.query.idAuditorium, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('Seat added to database');
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'users':
            if(method === 'GET') {
                db.getUsers((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.deleteUser(req.query.id, function() {
                    console.log('Removed user ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.createUser(req.query.name, req.query.email, req.query.password, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('User ' + req.query.name + " added to database");
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'bookings':
            if(method === 'GET') {
                db.getBookings((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.admin.generalQuery("DELETE FROM Bookings WHERE idBooking = ?;", [req.query.id], function() {
                    console.log('Removed user ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.createBooking(req.query.idUser, req.query.idScreening, req.query.idSeat, (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('User ' + req.query.name + " added to database");
                    res.json({status: 'OK'});
                });
            }
            break;
        case 'auditoriums':
            if(method === 'GET') {
                db.getAuditoriums((err, response) => {
                    if (err) {
                        console.error(err);
                    }
                    res.json(response);
                });
            } else if (method === 'DELETE') {
                db.admin.generalQuery("DELETE FROM Auditorium WHERE idAuditorium = ?;", [req.query.id], function() {
                    console.log('Removed auditorium ' + req.query.id);
                    res.json({status: 'OK'});
                });
            } else if (method === 'PUT') {
                db.admin.generalQuery("INSERT INTO Auditorium(idTheater) VALUES(?);", [req.query.idTheater], (err, response) => {
                    if(err)
                        console.error(err);
                    console.log('Auditorium added to database');
                    res.json({status: 'OK'});
                });
            }
            break;
        default:
            console.error('Invalid admin query ' + req.params.request);
    }
});

// get port from heroku or use default
var port = process.env.PORT || 8080;
app.listen(port, function () {
    console.log('Listening to port ' + port);
});
