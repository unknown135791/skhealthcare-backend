require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;


app.use(
    cors({
        origin: [
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "http://localhost:5501",
            "http://127.0.0.1:5501"
        ]
    })
);

app.use(express.json());



const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err);
});


async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,

            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,

            doctor TEXT NOT NULL,
            specialty TEXT NOT NULL,
            location TEXT NOT NULL,

            date TEXT NOT NULL,
            time TEXT NOT NULL,

            message TEXT,

            status TEXT NOT NULL DEFAULT 'Pending'
                CHECK (status IN ('Pending', 'Confirmed', 'Cancelled')),

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ
        );
    `);

    console.log("✅ Neon database ready");
}



app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "SK HEALTHCARES backend is running",
        database: "Neon PostgreSQL"
    });
});


app.get("/api/appointments", async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                name,
                phone,
                email,
                doctor,
                specialty,
                location,
                date,
                time,
                message,
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM appointments
            ORDER BY id DESC
        `);

        res.json(rows);

    } catch (error) {
        console.error("GET appointments error:", error);

        res.status(500).json({
            error: "Failed to fetch appointments"
        });
    }
});


app.get("/api/appointments/:id", async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                id,
                name,
                phone,
                email,
                doctor,
                specialty,
                location,
                date,
                time,
                message,
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM appointments
            WHERE id = $1
        `, [req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Appointment not found"
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error("GET appointment error:", error);

        res.status(500).json({
            error: "Database error"
        });
    }
});

app.post("/api/appointments", async (req, res) => {

    const {
        name,
        phone,
        email,
        doctor,
        specialty,
        location,
        date,
        time,
        message
    } = req.body;

    // Required fields
    if (
        !name ||
        !phone ||
        !doctor ||
        !specialty ||
        !location ||
        !date ||
        !time
    ) {
        return res.status(400).json({
            error: "Please fill all required fields."
        });
    }

    try {

        const { rows } = await pool.query(`
            INSERT INTO appointments
            (
                name,
                phone,
                email,
                doctor,
                specialty,
                location,
                date,
                time,
                message,
                status
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                'Pending'
            )
            RETURNING
                id,
                name,
                phone,
                email,
                doctor,
                specialty,
                location,
                date,
                time,
                message,
                status,
                created_at AS "createdAt"
        `, [
            name,
            phone,
            email || "",
            doctor,
            specialty,
            location,
            date,
            time,
            message || ""
        ]);

        res.status(201).json({
            success: true,
            message: "Appointment request submitted.",
            appointment: rows[0]
        });

    } catch (error) {

        console.error("POST appointment error:", error);

        res.status(500).json({
            error: "Failed to save appointment"
        });
    }
});



app.patch("/api/appointments/:id", async (req, res) => {

    const { status } = req.body;

    const validStatuses = [
        "Pending",
        "Confirmed",
        "Cancelled"
    ];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: "Invalid status"
        });
    }

    try {

        const { rows } = await pool.query(`
            UPDATE appointments
            SET
                status = $1,
                updated_at = NOW()
            WHERE id = $2

            RETURNING
                id,
                name,
                phone,
                email,
                doctor,
                specialty,
                location,
                date,
                time,
                message,
                status,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
        `, [status, req.params.id]);

        if (rows.length === 0) {
            return res.status(404).json({
                error: "Appointment not found"
            });
        }

        res.json({
            success: true,
            appointment: rows[0]
        });

    } catch (error) {

        console.error("PATCH appointment error:", error);

        res.status(500).json({
            error: "Failed to update appointment"
        });
    }
});



app.delete("/api/appointments/:id", async (req, res) => {

    try {

        const result = await pool.query(
            "DELETE FROM appointments WHERE id = $1",
            [req.params.id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                error: "Appointment not found"
            });
        }

        res.json({
            success: true,
            message: "Appointment deleted"
        });

    } catch (error) {

        console.error("DELETE appointment error:", error);

        res.status(500).json({
            error: "Failed to delete appointment"
        });
    }
});


app.get("/api/database/stats", async (req, res) => {

    try {

        const { rows } = await pool.query(`
            SELECT
                COUNT(*)::int AS total,

                COUNT(*) FILTER (
                    WHERE status = 'Pending'
                )::int AS pending,

                COUNT(*) FILTER (
                    WHERE status = 'Confirmed'
                )::int AS confirmed,

                COUNT(*) FILTER (
                    WHERE status = 'Cancelled'
                )::int AS cancelled

            FROM appointments
        `);

        res.json(rows[0]);

    } catch (error) {

        console.error("Stats error:", error);

        res.status(500).json({
            error: "Database error"
        });
    }
});
app.post("/api/admin/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: "Username and password are required"
        });
    }

    try {
        const { rows } = await pool.query(
            `
            SELECT id, username
            FROM admins
            WHERE username = $1
              AND password = $2
            `,
            [username, password]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: "Invalid username or password"
            });
        }

        res.json({
            success: true,
            message: "Login successful",
            admin: rows[0]
        });

    } catch (error) {
        console.error("Admin login error:", error);

        res.status(500).json({
            success: false,
            message: "Server/database error"
        });
    }
});

async function startServer() {

    try {

        await initDB();

        app.listen(PORT, "0.0.0.0", () => {

            console.log("");
            console.log("=================================");
            console.log("   SK HEALTHCARES BACKEND");
            console.log("=================================");
            console.log(`Server: http://localhost:${PORT}`);
            console.log("Database: Neon PostgreSQL");
            console.log("=================================");
            console.log("");

        });

    } catch (error) {

        console.error("❌ Database connection failed:");
        console.error(error);

        process.exit(1);
    }
}

startServer();