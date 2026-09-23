import sqlite3
import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
# Render dynamic environment secret key handling
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'bdxbet_secure_secret_key_2026')

def init_db():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            balance REAL DEFAULT 0.0,
            vip INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

# Initialize DB on start
init_db()

# --------------------------------------------------------------------------
# Website Routes
# --------------------------------------------------------------------------
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
    # --- Friend Search API ---
@app.route('/api/friend/search', methods=['POST'])
def api_friend_search():
    data = request.json or {}
    uid = data.get('uid', '').strip()
    
    conn = sqlite3.connect('users.db')
    cursor.execute("SELECT id, phone, balance FROM users WHERE phone LIKE ? OR id LIKE ?", (f"%{uid}%", f"%{uid}%"))
    user = cursor.fetchone()
    conn.close()
    
    if user:
        return jsonify({'success': True, 'user': {'uid': user[1], 'name': f"User {user[1][-4:]}", 'avatar': '👨‍💼'}})
    return jsonify({'success': False, 'message': 'User not found'})
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    phone = data.get('phone', '').strip()
    password = data.get('password', '')

    if not phone or not password:
        return jsonify({'success': False, 'message': 'সব ঘর পূরণ করুন!'}), 400

    hashed_password = generate_password_hash(password)

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    try:
        c.execute('INSERT INTO users (phone, password, balance) VALUES (?, ?, ?)', (phone, hashed_password, 50.0))
        conn.commit()
        session['user_phone'] = phone
        return jsonify({'success': True, 'message': 'রেজিস্ট্রেশন সফল! ৳৫০ বোনাস যোগ হয়েছে।'})
    except sqlite3.IntegrityError:
        return jsonify({'success': False, 'message': 'এই নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে!'}), 400
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
