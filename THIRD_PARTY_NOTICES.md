# Thành phần và nguồn dữ liệu

## HM reference software

`hm/source`, `hm/cfg`, `hm/cmake`, `hm/compat` và cấu hình CMake được lấy từ
bản HM trong dự án gốc. `CommonDef.h` xác định phiên bản **HM 18.0**.
Phần mã HM giữ nguyên thông báo bản quyền ITU/ISO/IEC và điều khoản BSD
trong [hm/COPYING](hm/COPYING). Các thông báo riêng trong từng tệp vẫn có hiệu lực.
`VisualDumper` và các hook trong `TEncCu.cpp` bổ sung trace cho lab.

## Dữ liệu hình ảnh demo

Dự án gốc ghi nguồn video là Pixabay, tên tệp
`pixabay_isometric_plain_design_14035.mp4`. Repo chỉ kèm năm frame đã chuyển
thành YUV 576×324 10-bit, ảnh preview và các kết quả mã hóa dùng trong lab;
không kèm video gốc đầy đủ.

Các hình này được tích hợp vào thí nghiệm phân tích HEVC. Chúng không được
cấp lại giấy phép như mã nguồn HM. Xem
[Pixabay Content License](https://pixabay.com/service/license-summary/) và
[điều khoản đầy đủ](https://pixabay.com/service/terms/) trước khi tái sử dụng hình
ngoài lab. Tên tác giả và trang tải cụ thể chưa được lưu trong dự án gốc.

## Công cụ cài riêng

Python, FFmpeg, CMake và trình biên dịch C++ được cài trên máy người dùng,
không được đóng gói vào repo. Giao diện web dùng JavaScript/CSS cục bộ và
server dùng thư viện chuẩn Python.
