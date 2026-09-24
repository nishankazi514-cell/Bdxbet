import sqlite3
import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'bdxbet_secure_secret_key_2026')

def init_db():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    # ডাটাবেজে id হলো অটো-ইনক্রিমেন্ট সংখ্যা এবং uid হলো আপনার 'LK-XXXXXX' কোড
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance REAL DEFAULT 2500.0,
            vip INTEGER DEFAULT 0
        )
    ''/.) # safety for existing table columns
    try:
        c.execute('ALTER TABLE users ADD COLUMN uid TEXT')
    except sqlite3.OperationalError:
        pass
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def home():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('index.html')

@app.route('/login')
def login_page():
    if session.get('user_phone'):
        return redirect(url_for('home'))
    return render_template('login.html')

@app.route('/speed-tap')
def speed_tap():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('Speedtap.html')

@app.route('/ludo')
def ludo_game():
    if not session.get('user_phone'):
        return redirect(url_for('login_page'))
    return render_template('ludo.html')

@app.route('/api/friend/search', methods=['POST'])
def api_friend_search():
    try:
        data = request.json or {}
        uid = data.get('uid', '').strip()
        if not uid:
            return jsonify({'success': False, 'message': 'UID দিন'})
        
        conn = sqlite3.connect('users.db')
        cursor = conn.cursor()
        # এখন সরাসরি uid এবং phone কলামে সার্চ করা হবে
        cursor.execute("SELECT * FROM users WHERE phone = ? OR uid = ? OR phone LIKE ? OR uid LIKE ?", 
                       (uid, uid, f"%{uid}%", f"%{uid}%"))
        user = cursor.fetchone()
        conn.close()
        
        if user:
            # user[2] হলো phone অথবা user[1] হলো uid
            u_code = str(user[1] if user[1] else user[2])
            phone_val = str(user[2])
            return jsonify({
                'success': True, 
                'user': {
                    'uid': u_code, 
                    'name': f"User {phone_val[-4:] if len(phone_val) >= 4 else phone_val}", 
                    'avatar': '👨‍💼'
                }
            })
        return jsonify({'success': False, 'message': 'User not found'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    phone = data.get('phone', '').strip()
    password = data.get('password', '')

    if not phone or not password:
        return jsonify({'success': False, 'message': 'Phone and password required'})

    hashed_password = generate_password_hash(password)
    uid = 'LK-' + phone[-6:].upper()

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute("""
            INSERT INTO users (uid, phone, password, balance, vip) 
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(phone) DO UPDATE SET password=excluded.password, uid=excluded.uid
        """, (uid, phone, hashed_password, 2500.0, 0))
        conn.commit()
        session['user_phone'] = phone
        return jsonify({'success': True, 'message': 'Registration successful'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    phone = data.get('phone', '').strip()
    password = data.get('password', '')

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT password, balance, vip FROM users WHERE phone = ?', (phone,))
    user = c.fetchone()
    conn.close()

    if user and check_password_hash(user[0], password):
        session['user_phone'] = phone
        return jsonify({'success': True, 'message': 'লগইন সফল হয়েছে!'})
    else:
        return jsonify({'success': False, 'message': 'মোবাইল নম্বর বা পাসওয়ার্ড ভুল!'}), 400

@app.route('/api/user', methods=['GET'])
def get_user():
    phone = session.get('user_phone')
    if not phone:
        return jsonify({'loggedIn': False})
    
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT balance, vip FROM users WHERE phone = ?', (phone,))
    user = c.fetchone()
    conn.close()

    if user:
        return jsonify({'loggedIn': True, 'phone': phone, 'balance': user[0], 'vip': user[1]})
    return jsonify({'loggedIn': False})

@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_phone', None)
    return jsonify({'success': True})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
