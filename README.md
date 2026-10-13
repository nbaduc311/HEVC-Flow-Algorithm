# HEVC Flow Algorithm — Intra / Inter Lab

Lab tương tác bằng tiếng Việt để quan sát thuật toán mã hóa HEVC trên **HM 18.0**: luồng thử CU, quyết định RD, motion, ma trận pixel 10-bit và đối chiếu trực tiếp mã C++. Có **8 cấu hình demo đã chạy sẵn** và có thể chạy encoder thật trên máy của bạn.

## Tải về và xem ngay

Chỉ cần **Python 3.10 trở lên** để xem toàn bộ kết quả mẫu. Không cần Node.js, npm, pip hay tải thêm video.

```bash
git clone https://github.com/nbaduc311/HEVC-Flow-Algorithm.git
cd HEVC-Flow-Algorithm
./run.sh
```

Hoặc chọn **Code → Download ZIP**, giải nén, mở terminal trong thư mục đó rồi chạy `python3 server.py`.

Mở **http://127.0.0.1:5174/** trong trình duyệt. Dừng server bằng `Ctrl+C`. Server chỉ lắng nghe trên localhost.

## Chạy encoder thật

Trên **Ubuntu / Debian / Windows WSL2 (Ubuntu)**:

```bash
sudo apt update
sudo apt install python3 build-essential cmake ffmpeg
./build.sh
./run.sh
```

Sau đó nhấn **Chạy HM thật** trong giao diện. Script build tự xác định vị trí encoder, không phụ thuộc tên phiên bản GCC hay đường dẫn trên máy tác giả. Mỗi lần chạy mới lưu riêng, không ghi đè demo.

Trên macOS có thể cài Python, CMake và FFmpeg bằng Homebrew (`brew install python cmake ffmpeg`), cùng Command Line Tools (`xcode-select --install`), rồi chạy các script như trên. Bản đóng gói đã được kiểm tra trên Linux x86_64; macOS chưa được kiểm chứng. Với Windows, dùng WSL2 để build/chạy encoder; chế độ chỉ xem có thể chạy bằng `python server.py` trong PowerShell với Python 3.10+.

`JOBS=2 ./build.sh` giới hạn số luồng build nếu máy ít RAM. Nếu dùng encoder tự build có đầy đủ hook trace, đặt `HEVC_ENCODER_BIN=/duong/dan/TAppEncoder` trước khi chạy server hoặc CLI.

Nếu báo thiếu encoder, chạy `./build.sh`. Nếu thiếu FFmpeg, cài `ffmpeg`. Nếu cổng 5174 đang được dùng, dừng phiên Lab cũ rồi chạy lại.

## Sáu vùng làm việc

1. **Chạy cấu hình:** chỉnh QP, Low Delay P/B, SearchRange, MaxNumMergeCand, ESD/FDM/CFM/ECU/AMP và CTU ghi trace. Nút “Chạy HM thật” gọi encoder cục bộ, lưu thành lần chạy mới, không ghi đè dữ liệu demo.
2. **So sánh A/B:** bitrate, Y-PSNR, bit và QP từng POC, diện tích Skip, số lượt RD trong ROI. Ghép cùng CU và loại lượt thử để phân rã `ΔJ = ΔD + λA×ΔR + RB×Δλ`. Có ảnh tái tạo và xuất CSV.
3. **Luồng thử CU:** chọn POC, CU từng độ sâu, đi từng lượt thử. Đọc D, R, λ, J, best trước, quyết định nhận/giữ, các lượt Merge bị bỏ vì FDM hoặc trùng CBF=0. Mở nhánh Motion PU và Luồng code sâu. Phân biệt best tạm thời với cây CU cuối.
4. **Pixel 10-bit:** sáu ma trận 8×8: Original tại đầu vào CU, Prediction, residual, Reconstruction trước lọc, residual tái tạo và sai số tái tạo. Chọn một ô để tính từng phép toán. Chỉ có mẫu cho các lượt Inter/Merge thực sự được đánh giá.
5. **Bản đồ CU/PU:** cập nhật theo lần chạy đang chọn; xem mode cuối, ranh giới nhiều PU, QP, MV/MVD và tham chiếu. Chọn CU trong ROI rồi mở “Luồng thử CU” để xem chi tiết. Với CU ngoài ROI, cấu hình lại CTU X/Y và chạy mới.
6. **Code & bằng chứng:** command đầy đủ, cấu hình gốc, override, encoder log, bitstream, trace JSONL, input/encoder SHA-256 và các file C++ liên quan. Có bảng tính QP hiệu dụng và λ từ cấu hình hiện tại.

## Bài trình bày gợi ý

Trong **Luồng thử CU**, ảnh nhỏ ở cột trái là toàn CTU 64×64; viền vàng chỉ vị trí CU. Hai hình phóng to bên phải cùng lấy đúng vùng CU: một hình vẽ phân hoạch của lượt thử đang chọn, một hình vẽ phân hoạch cuối giống Bản đồ CU/PU. Ảnh nền gốc/tái tạo được đồng bộ giữa hai vùng; nền này không phải reconstruction riêng của từng ứng viên. Chuyển sang bản đồ giữ POC và vị trí CU, rồi quay lại vẫn giữ lượt thử. Nếu CU thử không còn trong cây cuối, trang ghi rõ CU cuối chứa vị trí đó.

Ví dụ mốc QP 32, POC 0, CU 8×8 tại (256,128): HM thử Intra 2Nx2N (1 PU 8×8, J=141771.1512), rồi Intra NxN (4 PU 4×4, J=111998.5883). Phương án NxN có chi phí thấp hơn và xuất hiện trên bản đồ cuối. Nút “Đến lượt cùng phân hoạch với kết quả cuối” giúp đối chiếu hai màn hình.

- Giữ A = **Mốc QP 32**, chọn B = **QP 22** rồi **QP 42**. Giải thích QP cơ sở khác QP frame; quan sát bit, PSNR và λ.
- Mở cùng CU 32×32 tại (256,128), POC 1. Chọn cùng ứng viên trong hai lần chạy, phân rã ΔJ; sau đó mở “Luồng thử CU” và “Pixel 10-bit”.
- So mốc với **Bật Early Skip**: thứ tự Inter/Merge đổi, số lượt thử giảm.
- So mốc với **Tắt Fast Merge**: nhiều lượt RD hơn nhưng bộ mẫu này vẫn cho cùng bitstream. Thử nhiều hơn không đảm bảo thay đổi kết quả.
- So **1 merge candidate** hoặc **SearchRange 8** để liên hệ lựa chọn motion và kết quả toàn frame.
- Chọn **Low Delay B** để đọc cả motion field L0/L1. Đây là đổi cả preset GOP, gồm offset QP và tham chiếu, không phải phép cô lập riêng bi-prediction.
- Thay một tùy chọn từ trình duyệt, chạy HM, lưu CSV / log để đưa vào báo cáo.

## Tạo lại thí nghiệm

Input năm frame và toàn bộ dữ liệu cần để xem demo đã có trong repo. Không cần thư mục hoặc video nào nằm ngoài repo.

```bash
# Build HM đã thêm hook trace
./build.sh

# Chạy lại 8 cấu hình mẫu (ghi đè đúng 8 ID preset)
python3 experiments.py --presets

# Tạo lần chạy mới từ dòng lệnh
python3 experiments.py --config '{"qp":28,"esd":1,"ctuX":4,"ctuY":2}'

# Tạo lại toàn bộ demo từ input YUV đi kèm, gồm ảnh và bundle
./rebuild_demo.sh

# Kiểm tra dữ liệu các lần chạy đã lưu
python3 test_experiments.py
```

`run.sh` chỉ khởi động server, không tự build hoặc chạy lại preset. Các lệnh `--presets` và `rebuild_demo.sh` sẽ thay thế kết quả của tám preset; các lần chạy có ID `run-...` được giữ lại.

## Cấu trúc repo

```text
server.py, experiments.py   Server cục bộ và bộ chạy thí nghiệm
build.sh, run.sh            Build encoder và mở Lab
rebuild_demo.sh             Tạo lại demo từ input đi kèm
web/                       Giao diện, ảnh và 8 bộ kết quả mẫu
hm/source/                 HM 18.0 với hook ghi trace
hm/cfg/                    Các cấu hình encoder
hm/COPYING                 Giấy phép và bản quyền HM
data/                      Input YUV, bitstream mốc và trace demo
```

`build/`, bản build HM và dữ liệu thô của lần chạy mới được loại khỏi Git. `web/runs/manifest.json` thay đổi khi bạn chạy thêm thí nghiệm; đây là danh sách cục bộ. Những command trong demo là bằng chứng đã ghi trên máy tác giả nên chứa đường dẫn cũ. Để tái chạy trên máy bạn, dùng CLI phía trên; command của lần chạy mới sẽ dùng đường dẫn hiện tại.

## Nguồn dữ liệu và phạm vi

Năm mẫu hình trong dự án gốc lấy từ `pixabay_isometric_plain_design_14035.mp4` qua bản H.264 trung gian `pixabay_gop18_960x540.mp4`. Repo kèm trực tiếp input YUV đã lấy mẫu, không cần hai video này để sử dụng hay chạy lại thí nghiệm. Giữ loại picture nguồn `I,B,B,P,P` ở offset `+0,+3,+6,+9,+13` so với I-frame; vị trí tuyệt đối `54,57,60,63,67`, PTS `1.802,1.902,2.002,2.102,2.236` giây. Nhãn nguồn không quyết định loại slice của lần encode HEVC mới.

Input là 576×324 YUV420 10-bit, 5 frame. HM dùng 8 fps làm tốc độ quy ước của chuỗi mẫu; khoảng PTS nguồn không đều. HM thêm padding chiều cao lên 328 rồi crop khi xuất ảnh. CTU 64×64: X=0..8, Y=0..5. Mẫu trace dưới y=323 thuộc padding nội bộ.

`VisualDumper` ghi cây CU/PU cuối trên cả 270 CTU. `INTER_LAB_TRACE=1` bật snapshot RD chi tiết tại một CTU, chọn bằng `INTER_LAB_CTU_X/Y`. Hook nằm ngay trước năm nơi gọi `xCheckBestMode`: Merge, Inter, Intra, PCM và Split. Không sửa trạng thái encoder. Mỗi TRIAL ghi D, R, λ, J, best trước, accepted, QP, phân hoạch; với Inter còn có motion từng PU và ba buffer luma 8×8. Hai nhánh bỏ Merge ghi PRUNED riêng. Bộ mốc đã được đối chiếu bitstream với demo trước khi thêm hook.

- **D / R / λ / J:** số thật tại thời điểm thử. R là số bit ước lượng của CU trong ngữ cảnh entropy hiện tại; không phải một đoạn byte độc lập trong bitstream. `accepted` là best tạm thời, chưa quyết định cây cuối. Chi phí split có thể làm best thay đổi giữa hai snapshot.
- **Nhánh Split:** chi phí tổng hợp bốn CU con; không dùng skip/root CBF của phần tử đầu để kết luận cho cả CU cha.
- **Số lượt RD:** chỉ trong ROI đã chọn, trên cả 5 POC. Chỉ so trực tiếp khi hai lần chạy cùng ROI. PRUNED chỉ đếm hai lý do Merge đã ghi, không đếm mọi mode bị ESD/CFM/ECU cắt.
- **Bitrate:** số byte file .265 × 8 / (5/8 giây) / 1000. Số bit mỗi frame từ encoder log có thể không cộng thành đúng kích thước file vì overhead.
- **Y-PSNR:** trung bình số học 5 giá trị dB trong log; đây không phải PSNR tính lại từ ảnh WebP.
- **Skip:** phần trăm diện tích luma hiển thị, loại padding. KPI chuỗi lấy trung bình POC 1–4; không tính I-frame đầu.
- **10-bit:** buffer Prediction / Reconstruction của đúng ứng viên Inter. Reconstruction trước deblock/SAO, nên có thể khác ảnh cuối. SAD/SSE của patch 8×8 không phải D của cả CU gồm luma/chroma.
- **WebP:** ảnh gốc và tái tạo được chuyển xuống để hiển thị. Predictor ở vùng Bản đồ dựng gần đúng từ WebP. Nếu bi-pred, bản đồ chỉ minh họa nhánh L0; vùng Motion PU ghi cả L0/L1 và vùng Pixel có predictor HM thật.
- **Cùng merge index giữa hai lần chạy:** không bảo đảm cùng MV, nguồn candidate hoặc reference. So sánh ΔJ là phân rã số học, không tự chứng minh quan hệ nhân quả cho riêng một tham số.
- **Thời gian:** một lần đo, có trace và chịu ảnh hưởng tải máy. Không dùng như benchmark ổn định.
- **Chưa ghi:** mọi điểm tìm kiếm ME, toàn bộ AMVP candidates, nguồn không gian/thời gian của từng merge candidate, từng TU và hệ số DCT/quant. Giao diện không tạo số giả cho các bước đó.

`data/runs/<id>/` lưu YUV và trace thô. `web/runs/<id>/` lưu bundle, ảnh, log, command, cfg và bitstream để xem/tải. Hai file Python `experiments.py` và `server.py` tổ chức chạy encoder và cung cấp API. Server chỉ chạy một encode tại một thời điểm, kiểm tra miền tham số và gọi subprocess bằng danh sách đối số.

## Bản quyền và nguồn dữ liệu

Mã HM giữ giấy phép BSD trong [hm/COPYING](hm/COPYING). Hình demo có nguồn Pixabay và có điều khoản riêng. Xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) để biết phạm vi và nguồn dữ liệu.
