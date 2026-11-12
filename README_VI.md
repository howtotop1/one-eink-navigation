# ONE Navigation Web v1.0 – Galaxy A56 + E-Ink ONE-2.13L V0.8

## Mục đích và phạm vi

Trang web điều hướng chạy trực tiếp trong Chrome trên Samsung Galaxy A56. Chrome lấy GPS của điện thoại, tính tuyến bằng **Google Maps Platform Routes Library**, chọn chỉ dẫn tiếp theo, vẽ ảnh đen trắng 212×104 (hoặc 250×122) và gửi qua Web Bluetooth tới ONE-2.13L firmware V0.8.

**KHÔNG tạo/nạp firmware `.bin` mới.** Firmware V0.8 đã tương thích và đã được thử truyền ảnh từ trình duyệt Windows. Web dùng giao thức hình ảnh `FF00/FF01`, bắt đầu `0x80`, dữ liệu `0x81`, kết thúc làm mới `0x82` với tham số không ghi Flash. Không có lệnh OTA.

**Lưu ý quan trọng:** Trang web **không thể đọc chỉ dẫn từ ứng dụng Google Maps riêng**. Nó tự tạo tuyến trên bản đồ Google qua API. Không thể đảm bảo trang web tiếp tục gửi Bluetooth/GPS khi chuyển tab, bật Google Maps ngoài, tắt màn hình hoặc khóa điện thoại. Không dùng đây làm công cụ dẫn đường duy nhất khi chạy xe.

## Các tệp

- `index.html` – giao diện cho Galaxy A56.
- `app.js` – kết nối BLE, tính tuyến Google Routes JS, theo dõi GPS và vẽ E-Ink.
- `core.js` – nhận diện hướng rẽ và tính khoảng cách trên tuyến.
- `test_core.js` – kiểm thử thuật toán với Node.js, không cần E-Ink.

## Bước A – Test BLE không cần Google API key

1. Đưa các tệp web lên một địa chỉ **HTTPS** (hướng dẫn GitHub Pages bên dưới).
2. Trên Galaxy A56 bật Bluetooth, bật Vị trí. Đóng hoàn toàn nRF Connect/Eink Clock để chúng không chiếm kết nối.
3. Mở URL HTTPS của bạn bằng **Google Chrome trên Galaxy A56**.
4. Nhấn **Kết nối Bluetooth**, chọn `ONE-2.13L-7DE797` trong danh sách và cấp quyền.
5. Chọn **Rẽ phải / Rẽ trái**, nhấn **Gửi thử E-Ink**. Hình ảnh phải xuất hiện trên E-Ink.

Nếu lỗi Bluetooth: cần Chrome, HTTPS, thiết bị đang phát BLE, Chrome được phép Thiết bị ở gần và không bị app khác kết nối.

## Bước B – Tạo Google Maps Platform API key (làm một lần)

1. Mở https://console.cloud.google.com/ bằng tài khoản của bạn.
2. Tạo project Google Cloud, liên kết billing (có thể phát sinh phí theo lượng sử dụng).
3. Kích hoạt **Maps JavaScript API** và **Routes API** trong Google Maps Platform.
4. Tạo **API key** trong APIs & Services → Credentials.
5. **Bắt buộc** đặt hạn chế website (HTTP referrers) tương ứng đúng tên miền HTTPS của bạn, ví dụ `https://TEN_GITHUB.github.io/*` (nên siết thêm theo đường dẫn repo nếu tương thích với cách Google xác định Referer).
6. Ở **API restrictions**, giới hạn ở **Maps JavaScript API** và **Routes API**. Thiết lập hạn mức / cảnh báo chi phí trong Google Cloud.
7. Không đưa API key vào kho GitHub hoặc gửi API key qua chat. Trang web chỉ nhận key khi bạn nhập, không tự lưu key vào localStorage. API key nằm trong các yêu cầu tải SDK Google, nên bắt buộc hạn chế đúng domain/API.

Tài liệu:
- https://developers.google.com/maps/documentation/javascript/routes/start
- https://developers.google.com/maps/documentation/javascript/routes/get-a-route
- https://developers.google.com/maps/documentation/javascript/usage-and-billing
- https://developers.google.com/maps/api-security-best-practices

Không dùng Directions API (Legacy) cho project Google Cloud mới; sản phẩm đó đã chuyển trạng thái legacy. Bản này dùng `google.maps.routes.Route.computeRoutes()`.

## Bước C – Đưa website lên HTTPS bằng GitHub Pages

1. Đăng nhập GitHub, tạo repository công khai tên ví dụ `one-eink-navigation`.
2. Trong repository, chọn **Add file → Upload files**, tải cùng lúc `index.html`, `app.js`, `core.js` lên **thư mục gốc**. Không cần tải `test_core.js` lên nếu không muốn.
3. Mở **Settings → Pages → Build and deployment → Deploy from a branch**; chọn branch `main`, folder `/ (root)`, nhấn Save.
4. Khi GitHub báo địa chỉ, mở `https://TEN_GITHUB.github.io/one-eink-navigation/` trên Galaxy A56 bằng Chrome. Website chỉ hoạt động Web Bluetooth trên HTTPS hoặc localhost. Chạy `python -m http.server` trên máy Windows rồi mở bằng IP LAN `http://192.168.x.x` trên điện thoại sẽ **không** đáp ứng điều kiện HTTPS.
5. Kiểm tra BLE bằng Bước A trước, sau đó làm Bước D.

## Bước D – Dẫn đường thực tế

1. Trên Galaxy A56 mở trang HTTPS bằng Chrome.
2. Nhấn **Kết nối Bluetooth** và chọn ONE-2.13L.
3. Dán API key của project Google Cloud vào ô tương ứng, nhấn **Tải bản đồ Google**.
4. Nhấn **Lấy vị trí GPS**, cấp quyền vị trí **Chính xác** cho Chrome/website.
5. Nhập điểm đến (ví dụ địa chỉ đầy đủ) hoặc chạm trực tiếp trên bản đồ để chọn tọa độ.
6. Chọn xe máy (nếu Routes API hỗ trợ ở khu vực đó), hoặc ô tô/đi bộ để kiểm thử.
7. Nhấn **Tính tuyến Google**, xem tuyến màu xanh trên bản đồ, rồi nhấn **Bắt đầu dẫn đường**.
8. Khi GPS di chuyển, trang web ước lượng khoảng cách trên tuyến đến lần đổi hướng tiếp theo, cập nhật mũi tên và truyền ảnh E-Ink mỗi 12 giây hoặc lâu hơn khi cần. Bạn có thể chọn 20/30 giây để hạn chế làm mới màn E-Ink.
9. Nếu đi lệch tuyến, web hiển thị cảnh báo và có nút **Tính lại tuyến**. Bản web **không tự tính lại tuyến liên tục** để tránh gọi API liên tục và phát sinh phí.
10. Nhấn **Dừng** để kết thúc theo dõi GPS.

## Những hạn chế kỹ thuật cần biết

- Không có tích hợp với thông báo của Google Maps app; app này chạy độc lập trong Chrome bằng Google Routes.
- Tốc độ làm mới E-Ink phụ thuộc firmware và phần cứng; web cố gắng hạn chế làm mới quá nhanh.
- Định vị GPS có thể sai khi vào phố hẹp, hầm, đường song song. Thuật toán đang dùng phép chiếu lên đường đi và có thể chọn nhầm bước rẽ ở giao lộ phức tạp. **Dùng làm bản thử, không làm hệ thống dẫn đường an toàn/được chứng nhận.**
- Khi điện thoại khóa màn hình, Chrome có thể tạm dừng GPS/BLE; web cố xin Screen Wake Lock khi bắt đầu dẫn đường để giữ màn sáng, nhưng không thể đảm bảo.
- Gói hiện chưa được thử trên Galaxy A56 thực tế hoặc xác nhận Google Cloud Routes API key của người dùng; thuật toán cơ bản đã qua test và Javascript đã được kiểm tra cú pháp.
- Google Maps API key cần kết nối Internet; bản web không có offline routing.
- `TWO_WHEELER` có thể không khả dụng ở mọi nơi. Khi Google báo lỗi, thử `DRIVING` để kiểm tra kết nối.

## Nếu muốn thực sự khóa màn hình hoặc chạy Google Maps app cùng lúc

Giới hạn này không thể sửa chỉ bằng firmware E-Ink hay website Chrome. Cần ứng dụng Android chạy foreground service, kết nối BLE nền và có phương pháp được hỗ trợ để lấy chỉ dẫn điều hướng (ví dụ tự xây bằng Google Navigation SDK hoặc nền tảng khác, tùy điều khoản/phí). Bản Android ONE Navigation riêng sẽ là hướng nâng cấp tiếp theo.

## Kiểm thử code

Nếu có Node.js: `node test_core.js`. Kết quả dự kiến `OK: 14 navigation core checks`.

## Ghi nguồn Google Maps và trang pháp lý

Khi hiển thị dữ liệu tuyến từ Google, bản web tự thêm chữ **Google Maps** ở hàng cuối của E-Ink (yêu cầu ghi nguồn khi không hiển thị trực tiếp trên Google Map). Giao diện điện thoại luôn có Google Map do Google cung cấp. Bộ mã có `privacy.html`, `terms.html` dạng mẫu; nếu công khai website, cần điều chỉnh thông tin phù hợp người vận hành và kiểm tra điều khoản cấp phép thực tế.
