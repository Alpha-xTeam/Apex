#!/bin/bash
echo 'تمت إضافة مستخدم جديد'
useradd -m -s /bin/bash user123
echo 'تم تعيين كلمة المرور للمستخدم الجديد'
echo 'user123:password123' | chpasswd