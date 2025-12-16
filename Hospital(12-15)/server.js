const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 8080;

// --- 1. MIDDLEWARE ---
app.use(cors());
// Increased limit to 50mb to handle large profile images
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'patient_login.html')); 
});

// --- 2. DATABASE CONNECTION ---
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'barangayhealthcenter',
    password: 'samganda', 
    port: 5432,
});

// --- 3. API ENDPOINTS ---

// ➤ A. GET PROFILE
app.get('/get-profile', async (req, res) => {
    const userId = req.query.user_id;
    try {
        const { rows } = await pool.query("SELECT * FROM patients WHERE patient_id = $1", [userId]);
        if (rows.length > 0) {
            res.json({ success: true, user: rows[0] });
        } else {
            res.json({ success: false, message: 'User not found' });
        }
    } catch (err) {
        console.error("Get Profile Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ➤ B. UPDATE PROFILE (FIXED: Uses first_name & last_name)
app.put('/update-profile', async (req, res) => {
    const { user_id, first_name, last_name, email, phone, address, profile_picture } = req.body;
    
    console.log(`Updating user ${user_id}:`, { first_name, last_name });

    try {
        // Update separate columns
        await pool.query(
            "UPDATE patients SET first_name = $1, last_name = $2, email = $3, phone = $4, address = $5, profile_picture = $6 WHERE patient_id = $7",
            [first_name, last_name, email, phone, address, profile_picture, user_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Database Update Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ➤ C. BOOK APPOINTMENT
app.post('/book-appointment', async (req, res) => {
    const { patient_id, appointment_date, reason } = req.body; 
    if (!appointment_date || !reason) return res.status(400).json({ success: false, error: 'Missing details.' });

    try {
        const sql = `INSERT INTO appointments (patient_id, appointment_date, reason, status) VALUES ($1, $2::DATE, $3, 'Pending')`;
        await pool.query(sql, [patient_id, appointment_date, reason]); 
        
        const notifSql = `INSERT INTO notifications (patient_id, title, message, type) VALUES ($1, 'Appointment Booked', $2, 'success')`;
        const message = `You successfully booked ${reason} on ${appointment_date}.`;
        await pool.query(notifSql, [patient_id, message]);

        res.json({ success: true });
    } catch (err) {
        console.error("Booking Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ➤ D. GET APPOINTMENTS
app.get('/user-appointments', async (req, res) => {
    const userId = req.query.user_id;
    try {
        const sql = `SELECT appointment_id AS id, appointment_date, reason, status FROM appointments WHERE patient_id = $1 ORDER BY appointment_date DESC`;
        const { rows } = await pool.query(sql, [userId]);
        res.json(rows); 
    } catch (err) {
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// ➤ E. CANCEL APPOINTMENT
app.post('/cancel-appointment', async (req, res) => {
    const { appointment_id } = req.body;
    try {
        const checkRes = await pool.query("SELECT * FROM appointments WHERE appointment_id = $1", [appointment_id]);
        if (checkRes.rows.length === 0) return res.status(404).json({success: false});
        const { patient_id, reason, appointment_date } = checkRes.rows[0];

        await pool.query("UPDATE appointments SET status = 'Cancelled' WHERE appointment_id = $1", [appointment_id]);
        
        const notifSql = `INSERT INTO notifications (patient_id, title, message, type) VALUES ($1, 'Appointment Cancelled', $2, 'info')`;
        const dateStr = new Date(appointment_date).toDateString();
        await pool.query(notifSql, [patient_id, `Cancelled: ${reason} on ${dateStr}.`]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ➤ F. GET NOTIFICATIONS
app.get('/my-notifications', async (req, res) => {
    const userId = req.query.user_id;
    try {
        const sql = `SELECT * FROM notifications WHERE patient_id = $1 ORDER BY created_at DESC LIMIT 10`;
        const { rows } = await pool.query(sql, [userId]);
        const unreadCount = rows.filter(n => !n.is_read).length;
        res.json({ success: true, notifications: rows, unread_count: unreadCount });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ➤ G. MARK NOTIFICATIONS READ
app.post('/mark-notifications-read', async (req, res) => {
    const { user_id } = req.body;
    try {
        await pool.query("UPDATE notifications SET is_read = TRUE WHERE patient_id = $1", [user_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`\n🎉 Server running at http://localhost:${PORT}`);
});