# TR-SYNTAX REMAP

เว็บแอป PHP/MySQL สำหรับร้านไฟล์รีแมพและบริการจูน ECU มอเตอร์ไซค์ พร้อมระบบสมาชิก ร้านไฟล์ แพ็กเกจ ชำระเงินแนบสลิป และหลังบ้านแอดมิน

## ความต้องการระบบ

- PHP 8+
- MySQL หรือ MariaDB
- Apache/XAMPP
- เปิด extension `pdo_mysql` และ `fileinfo`

## วิธีติดตั้งบน XAMPP

1. คัดลอกโฟลเดอร์ `tr-syntax-remap` ไปไว้ใน `htdocs`
2. เปิด phpMyAdmin แล้วสร้างฐานข้อมูล หรือ import ไฟล์ `database.sql` ได้ทันที
3. แก้ไขไฟล์ `config/database.php` ให้ตรงกับ MySQL ของเครื่อง
   - `DB_HOST`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASS`
4. ตรวจสอบสิทธิ์เขียนโฟลเดอร์ `uploads/slips/` และ `uploads/files/`
5. เปิดผ่านเบราว์เซอร์: `http://localhost/tr-syntax-remap/`

## Default Admin Login

- URL: `http://localhost/tr-syntax-remap/admin/login.php`
- Email: `admin@trsyntax.local`
- Password: `admin123456`

## HWID Lock API

- Admin page: `http://localhost/tr-syntax-remap/admin/hwid.php`
- C# API endpoint: `POST http://localhost/tr-syntax-remap/api/hwid.php`
- Required fields: `license_key`, `hwid`
- Optional fields: `app_name`, `version`, `machine_name`
- Response: JSON with `ok`, `status`, `message`, `expires_at`

Flow: admin creates a license key, C# sends the key and HWID on startup, and the first valid request binds that key to the machine. Later requests must use the same HWID. Use `examples/csharp/HwidLockExample.cs` as the C# starter code.

If the database already exists, open the HWID admin page once or import `migrations/add_hwid_licenses.sql` to add the table.

หมายเหตุ: ใน `database.sql` มีบัญชีแอดมินเริ่มต้นแบบ bootstrap เมื่อเข้าสู่ระบบครั้งแรกด้วยรหัสด้านบน ระบบจะสร้าง hash ด้วย `password_hash()` แล้วบันทึกแทนค่าเริ่มต้นอัตโนมัติ

## โครงสร้างสำคัญ

- `config/database.php` ตั้งค่าการเชื่อมต่อ PDO
- `config/auth.php` session auth, helper escape, flash message
- `config/csrf.php` CSRF token
- `shop.php` ร้านไฟล์รีแมพพร้อม filter
- `checkout.php` สั่งซื้อและอัปโหลดสลิป
- `admin/products.php` CRUD สินค้า/ไฟล์
- `admin/packages.php` CRUD แพ็กเกจ
- `admin/orders.php` ตรวจและเปลี่ยนสถานะออเดอร์

## สถานะออเดอร์

- `pending` รอตรวจสอบ
- `approved` อนุมัติแล้ว ผู้ใช้เห็นลิงก์ดาวน์โหลดไฟล์สินค้า
- `rejected` ปฏิเสธ
- `completed` เสร็จสิ้น
