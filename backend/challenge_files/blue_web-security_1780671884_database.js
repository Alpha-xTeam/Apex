function searchBooks(query) {
  // استعلام قاعدة البيانات
  var sql = "SELECT * FROM books WHERE title LIKE '%" + query + "%';";
  // تنفيذ الاستعلام
  db.execute(sql, function(err, results) {
    if (err) {
      console.error(err);
    } else {
      // معالجة النتائج
      console.log(results);
    }
  });
}