# HEVC Flow Algorithm — Intra / Inter Lab

Lab tương tác bằng tiếng Việt để quan sát thuật toán mã hóa HEVC trên **HM 18.0**: luồng thử CU, quyết định RD, motion, ma trận pixel 10-bit và đối chiếu trực tiếp mã C++. Có **8 cấu hình Inter tại CTU (4,1)**, 8 bản lịch sử tại CTU (4,2), **9 cấu hình All Intra**, và có thể chạy encoder thật trên máy của bạn.

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

CTU quan sát mặc định hiện tại là **(4,1)**, tức vùng luma **(256,64), kích thước 64×64**. Tám cấu hình mẫu hiện tại có ID kết thúc bằng `-ctu4-1`; danh sách chọn lần chạy ghi rõ tọa độ CTU. Các lần chạy ở (4,2) vẫn được giữ để đọc lại ví dụ cũ.

## Tám vùng làm việc

1. **Chạy cấu hình:** chỉnh QP, All Intra hoặc Low Delay P/B, các tùy chọn Intra/RD, SearchRange, MaxNumMergeCand, ESD/FDM/CFM/ECU/AMP và CTU ghi trace. Nút “Chạy HM thật” gọi encoder cục bộ, lưu thành lần chạy mới, không ghi đè dữ liệu demo. Bộ thí nghiệm Intra có nút điền form, xem trace và so với mốc riêng.
2. **So sánh A/B:** bitrate, Y-PSNR, bit và QP từng POC, diện tích Skip, số lượt RD trong ROI. Ghép cùng CU và loại lượt thử để phân rã `ΔJ = ΔD + λA×ΔR + RB×Δλ`. Có vùng ảnh gốc cạnh ảnh tái tạo của nhiều cấu hình, chỉ cắt CTU đang xét của B: chọn cấu hình hiển thị, POC chung và mức phóng 3×–8×. Mặc định chọn A/B và QP 22/42 cùng CTU nếu có. Các cấu hình ghi trace ở CTU khác vẫn được cắt tại cùng tọa độ của B; ảnh WebP dùng để quan sát, không dùng tính D 10-bit. Có xuất CSV.
3. **Luồng thử CU:** chọn POC, CU từng độ sâu, đi từng lượt thử. Đọc D, R, λ, J, best trước, quyết định nhận/giữ, các lượt Merge bị bỏ vì FDM hoặc trùng CBF=0. Mở nhánh Motion PU và Luồng code sâu. Phân biệt best tạm thời với cây CU cuối.
4. **Pixel 10-bit:** sáu ma trận 8×8: Original tại đầu vào CU, Prediction, residual, Reconstruction trước lọc, residual tái tạo và sai số tái tạo. Chọn một ô để tính từng phép toán. Chỉ có mẫu cho các lượt Inter/Merge thực sự được đánh giá.
5. **Bản đồ CU/PU:** cập nhật theo lần chạy đang chọn; xem mode cuối, ranh giới nhiều PU, QP, MV/MVD và tham chiếu. Chọn CU trong ROI rồi mở “Luồng thử CU” để xem chi tiết. Với CU ngoài ROI, cấu hình lại CTU X/Y và chạy mới.
6. **Code & bằng chứng:** command đầy đủ, cấu hình gốc, override, encoder log, bitstream, trace JSONL, input/encoder SHA-256 và các file C++ liên quan. Có bảng tính QP hiệu dụng và λ từ cấu hình hiện tại.
7. **Intra chuyên sâu:** chọn POC, lượt `xCheckRDCostIntra` và từng PU luma; xem 35 mode sàng lọc, MPM xét bổ sung, các lượt RD/REFINE luma với cây TU, RD chroma và D/R/J cuối cả CU. Nút **Đi sâu các mode Intra của lượt này** trong Luồng thử CU mở đúng tìm kiếm; nút quay về mở nguồn D/R/λ của cùng lượt.

8. **Inter chuyên sâu:** nguồn Merge và lý do nhận/loại, hai vòng residual/Skip, AMVP theo từng PU/list/reference, kiểm lại bit MVD, kết quả integer và từng điểm half/quarter-pel, kết quả RD toàn CU. Mở đúng tìm kiếm từ nút **Đi sâu Merge / AMVP / Motion của lượt này** trong Luồng thử CU.

## Theo dõi Merge, AMVP và motion

Mở **http://127.0.0.1:5174/?poc=1#inter**. Chọn lần chạy, POC, tìm kiếm CU và PU; mỗi lần gọi `xCheckRDCostMerge2Nx2N` hoặc `xCheckRDCostInter` có mã tìm kiếm riêng.

1. **Nguồn Merge:** sơ đồ A1/B1/B0/A0/B2 và nhật ký theo thứ tự thực thi. Ghi các nhánh không có lân cận, lân cận Intra, cùng MER, phân hoạch bị loại, trùng motion; các candidate temporal, kết hợp L0/L1, ZERO. Bảng cuối lấy danh sách thực sự dùng, sau giới hạn bi-pred cho PU nhỏ. Vị trí không có bản ghi có thể chưa được xét vì danh sách đã đầy. Không tự dựng lại nguồn từ MV cuối.
2. **Merge / Skip & RD:** phân biệt Merge 2Nx2N thử RD cả CU với Merge trong từng PU so bằng chi phí prediction. Vòng 0 cho phép residual; vòng 1 ép residual bằng 0. Ghi lượt bị FDM hoặc ALREADY_ZERO_CBF bỏ, CBF/Skip thực, best trước, D/R/λ/J; ghi trạng thái ESD và `earlyDetectionSkipMode` sau tìm kiếm. Một PU chọn Merge không tự biến CU nhiều PU thành Skip.
3. **AMVP / MVD:** từng lần tìm predictor ở các lân cận, nhánh unscaled/scaling, loại trùng, temporal và ZERO; danh sách cuối, SAD template, bit index và MVP chọn ban đầu. Bảng `xCheckBestMVP` cho thấy giữ nguyên MV nhưng thay MVP có thể giảm bit MVD + index. `MVD = MV − MVP` dùng cùng đơn vị qpel. Nhánh scaling không khẳng định vector thực sự bị scale; NO_MATCH chưa tách mọi điều kiện reference bên trong hàm.
4. **Tìm motion:** giới hạn tìm integer thực dùng, MV/SAD thắng; từng điểm half-pel và quarter-pel với metric, R vector, hệ số motion, chi phí và best trước. Nhấn điểm trên đồ thị để đọc số. `getCost(R) = floor(lambda_motion × R)`, hệ số lấy từ trạng thái HM, khác λ RD toàn CU. Kết quả bi-refine ghi distortion của target sau `removeHighFreq`, trọng số 0.5; bảng so L0/L1/bi ghi chi phí thực và cách xử lý hòa. Một số nhánh L1 dùng lại kết quả L0 nên không có lời gọi ME mới.
5. **Kết quả CU:** motion các PU, D theo Y/Cb/Cr, bộ đếm CABAC R, λ/J và so sánh best. Có nút mở lại nguồn D/R/λ và pixel của đúng lượt. D/R của bước tìm motion không được cộng máy móc thành D/R cuối sau tái tạo.

Giới hạn: trace ghi **kết quả integer và tất cả điểm fractional được thử**, chưa ghi mọi điểm integer/TZ, từng tap nội suy, mọi phép scale temporal, hoặc các hệ số residual của từng lượt transform/quant. SAD có thể dùng ngưỡng thoát sớm; distortion của điểm bị loại không nhất thiết là tổng đầy đủ trên mọi pixel. MV trong file dùng đơn vị ¼ pixel; tọa độ giới hạn integer dùng pixel.

`inter.jsonl` được tách thành `inter/index.json` và `inter/<search>.json` để tải theo tìm kiếm. `interSearchId` nối các sự kiện TRIAL/PRUNED với trace này. Trace không thay quyết định mã hóa. `enrich_inter.py` replay các cấu hình đã lưu, chỉ gắn trace sau khi kiểm input, bitstream, cây CU và các trường quyết định cũ. `provenance.interReplay` lưu command/SHA riêng của lần bổ sung. Các lần chạy mới qua API tự thu cả Intra và Inter.

## Cấu hình và bài trình bày Intra

Mở **http://127.0.0.1:5174/#experiments**, chọn **All Intra · 5 I-frame**. Các trường trong nhóm **Intra prediction & RD** được truyền thật qua command line tới HM:

| Trường | Option HM | Mặc định bộ All Intra |
| --- | --- | --- |
| Sàng lọc có bổ sung MPM | `FastUDIUseMPMEnabled` | Bật |
| Strong intra smoothing | `StrongIntraSmoothing` | Bật |
| Độ sâu tối đa cây TU Intra | `QuadtreeTUMaxDepthIntra` | 3, có thể chọn 1–5 |
| Transform skip | `TransformSkip` | Bật |
| Tìm transform skip nhanh | `TransformSkipFast` | Bật |
| RDOQ cho biến đổi thường | `RDOQ` | Bật |
| RDOQ cho transform skip | `RDOQTS` | Bật |
| Offset QP của I-frame | `IntraQPOffset` | 0, cho phép −6…6 |

All Intra dùng `encoder_intra_main10.cfg`, `IntraPeriod=1`, `GOPSize=1`, cùng override `LambdaFromQpEnable=1`. Với mốc QP 32 và offset 0, cả 5 frame có QP 32. Low Delay P/B giữ mặc định offset −1 của các thí nghiệm trước. Offset chỉ áp dụng cho I-slice, không áp riêng cho CU Intra trong P/B-slice. Các công tắc transform/quant cũng có thể ảnh hưởng residual Inter khi chạy P/B.

Đã chạy sẵn **9 thí nghiệm** tại CTU (4,1): mốc QP 32, QP 22, QP 42, không bổ sung MPM, tắt strong smoothing, TU depth 1, tắt transform skip, mở rộng thử transform skip, tắt RDOQ cả hai nhánh. ID dùng tiền tố `allintra-`, tách khỏi dữ liệu replay `intra-` của các lần chạy cũ.

Trình tự trình bày gợi ý:

1. **Mốc QP 32 → Xem kết quả Intra:** chọn POC/CU/PU, đi từ 35 mode sàng lọc đến shortlist, RD luma/TU, RD chroma và RD cả CU.
2. **QP 22 / QP 42 → So với mốc:** xem ảnh cùng CTU, bit/PSNR và D/R/λ/J của cùng CU.
3. **Không bổ sung MPM:** đối chiếu danh sách giữ lại và số lượt RD. Khi tắt, HM đổi cả bảng số mode cơ sở; vẫn có bước sàng lọc 35 mode.
4. **TU depth 1:** so cây TU và khối lượng tìm kiếm. TU tối đa vẫn 32×32 nên CU 64×64 còn có chia bắt buộc.
5. **Transform skip / RDOQ:** liên hệ lượng tử, residual và quyết định RD cuối. Transform skip vẫn có lượng tử; không phải Skip CU của Inter. Tắt RDOQ hoàn toàn cần tắt cả `RDOQ` và `RDOQTS`.

Tab So sánh thêm số lần tìm Intra, mode sàng lọc, RD luma/REFINE/chroma và số nút TU trả kết quả, cộng trên 5 POC trong cùng CTU. Nút TU gồm cha và con của quá trình thử, không phải số TU cuối. Strong smoothing chỉ có tác dụng khi điều kiện khối luma 32×32 thỏa; tắt tùy chọn có thể không làm đổi kết quả. Trace chưa tách từng lượt transform-skip hoặc từng hệ số lượng tử bên trong mode.

## Theo dõi từng mode Intra

Mở **http://127.0.0.1:5174/?poc=0#intra**. Tab gồm bốn bước:

1. **35 mode & MPM:** ghi `uiSad`, `iModeBits`, `sqrtLambdaForFirstPass` và chi phí thật trong `estIntraPredLumaQT`. Với các cấu hình hiện tại, `uiSad` là SATD trên Original − Prediction. Chi phí nhanh là `SATD + sqrt(lambda) × R_mode`; đây chưa phải distortion sau tái tạo. Có xếp hạng, danh sách giữ lại theo đúng thứ tự, MPM bổ sung và patch Original/Prediction thật cho mỗi mode. MPM hiển thị là phần vòng lặp `numCand` xét bổ sung, có thể ít hơn bộ 3 MPM báo hiệu.
2. **RD luma & TU:** xem D/R/λ/J và best trước của từng mode trong shortlist. R lấy trực tiếp từ `uiSingleBits` / `uiSplitBits` của cây TU được chọn. RDO ban đầu hạn chế chia TU theo `HHI_RQT_INTRA_SPEEDUP`; REFINE thử lại mode tốt với tìm kiếm TU đầy đủ hơn. Bảng TU thể hiện chi phí chia/không chia tại mỗi lần trả về đệ quy; TU cha đã chứa các con, không cộng tất cả dòng. Intra NxN có bốn PU luma, mỗi PU có chuỗi thử riêng.
3. **RD chroma:** mode Planar, DC, Horizontal, Vertical và DM (có thay thế Angular 34 khi trùng luma), D có trọng số của Cb + Cr, R chroma, λ/J và lựa chọn. Với YUV420 hiện tại, bốn PU luma NxN vẫn dùng một nhóm tìm mode chroma chung.
4. **RD cả CU:** cộng D luma/chroma đã chọn; đọc R được đếm lại trong `xCheckRDCostIntra`, tính J và so với best CU trước. R cuối không phải phép cộng R của các lượt thử riêng. Kết quả được nhận tại đây vẫn có thể bị mode khác hoặc chia CU thay thế.

Trace được ghi trực tiếp trong HM, chỉ tại CTU quan sát. File `intra.jsonl` được tách thành `intra/index.json` và từng `intra/<search>.json` để tải khi cần. Trường `intraSearchId` nối tìm kiếm với sự kiện INTRA cuối. Các cấu hình chạy mới qua API tự thu trace này.

`enrich_intra.py` bổ sung trace cho các lần chạy cũ bằng chạy lại cùng cấu hình, kiểm input, bitstream, cây CU và các trường quyết định cũ trước khi gắn đường dẫn. Các phiên bản trace cũ có thể lưu buffer inline hoặc chưa có cột bit phân số; phép đối chiếu vẫn kiểm mọi số đã có. `provenance.intraReplay` lưu command và SHA encoder dùng bổ sung; tab có link riêng tới bằng chứng đó. Log và thời gian encode cũ được giữ nguyên.

Chưa ghi từng hệ số biến đổi/lượng tử hoặc từng lần thử transform-skip bên trong một mode. Patch 8×8 không đại diện cho toàn distortion của PU/CU.

## Truy nguồn D, R và lambda trong mỗi phép RD

Trong **Luồng thử CU**, chọn một hàng rồi mở **Nguồn D · R · λ** (hoặc nút dưới công thức J).

- **D:** phân rã Y/Cb/Cr, số mẫu, SSE chưa nhân trọng số, trọng số chroma và các nhóm cộng. Với Intra, cây TU đã chọn xác định từng hình chữ nhật; mỗi TU cắt phần thập phân sau nhân trọng số rồi mới cộng. Với Inter, tính trên toàn thành phần sau khi tái tạo và clip. Breakdown được đối chiếu từ buffer Original/Reconstruction 10-bit của ứng viên và trọng số thật; chương trình yêu cầu tổng khớp `getTotalDistortion()` trước khi xuất kết quả. Có thể mở từng hàng pixel để kiểm `(O−Rec)²` và tổng SSE. Với Split, D là tổng D của các CU con được sao chép bằng `copyPartFrom`.
- **R:** snapshot bộ đếm sau từng nhóm cú pháp trong lần encode thử cuối của ứng viên. Bảng ghi giá trị nguyên tích lũy, mức tăng và `m_fracBits` theo đơn vị 1/32768 bit. Reset giữ phần lẻ CABAC. Mức tăng 0 bit không luôn có nghĩa cú pháp không được phát; cần nhìn cả cột phần lẻ. `encodeCoeff` gồm cấu trúc TU, CBF, hệ số và QP khi áp dụng. Với Split, bảng tách số bit con và phần báo hiệu bổ sung. Bảng chưa ghi mọi bin/context riêng lẻ.
- **Lambda:** số thật từ `getLambda()` được đối chiếu với công thức `0.57 × 2^((QPframe + 6×(bitDepth−8) − 12)/3)` của các preset hiện tại. Có bảng đi từ QP cơ sở, offset GOP và mô hình offset đến QP frame. Không áp công thức rút gọn nếu nó không khớp trace.

Ví dụ lịch sử **Mốc QP 32 tại CTU (4,2), POC 0, CU 64×64 tại (256,128), Intra 2Nx2N**:

```text
D_Y  = 647851
D_Cb = 159443  (SSE 126554, trọng số 1.2599210498948732, cộng sau cắt theo 10 TU)
D_Cr = 175849  (SSE 139576, cùng trọng số, 10 TU)
D    = 983143
R    = 2 + 2048 = 2050
       bộ đếm cuối m_fracBits = 67198310; floor(67198310 / 32768) = 2050
QP frame = 31; lambda = 0.57 × 2^(31/3) = 735.3907184026398
J    = 983143 + lambda × 2050 = 2490693.972725412
```

`details/<seq>.json` lưu toàn bộ Original/Reconstruction Y/Cb/Cr, tải khi mở nguồn số liệu để tránh nạp mọi buffer cùng lúc. `enrich_rd_origins.py` có thể bổ sung nguồn cho lần chạy cũ bằng replay. Chỉ gắn thêm các trường sau khi xác minh input/output, cây CU và mọi trường quyết định cũ khớp; log, thời gian và SHA encoder cũ được giữ nguyên. `provenance.rdOriginReplay` xác định encoder/lần chạy bổ sung; tab Code & bằng chứng có link trace bổ sung riêng.

## Bài trình bày gợi ý

Trong **Luồng thử CU**, ảnh nhỏ ở cột trái là toàn CTU 64×64; viền vàng chỉ vị trí CU. Hai hình phóng to bên phải cùng lấy đúng vùng CU: một hình vẽ phân hoạch của lượt thử đang chọn, một hình vẽ phân hoạch cuối giống Bản đồ CU/PU. Ảnh nền gốc/tái tạo được đồng bộ giữa hai vùng; nền này không phải reconstruction riêng của từng ứng viên. Nút “Xem trên bản đồ ↗” mở bản đồ trong tab mới, giữ lần chạy, POC, vị trí CU, lượt thử và nguồn ảnh qua URL. Tab luồng thử hiện tại vẫn giữ nguyên lựa chọn. Nếu CU thử không còn trong cây cuối, trang ghi rõ CU cuối chứa vị trí đó.

Ví dụ lịch sử mốc QP 32 tại CTU (4,2), POC 0, CU 8×8 tại (256,128): HM thử Intra 2Nx2N (1 PU 8×8, J=141771.1512), rồi Intra NxN (4 PU 4×4, J=111998.5883). Phương án NxN có chi phí thấp hơn và xuất hiện trên bản đồ cuối. Nút “Đến lượt cùng phân hoạch với kết quả cuối” giúp đối chiếu hai màn hình.

- Giữ A = **Mốc QP 32**, chọn B = **QP 22** rồi **QP 42**. Giải thích QP cơ sở khác QP frame; quan sát bit, PSNR và λ.
- Mở cùng CU 32×32 tại (256,64), POC 1 trong hai lần chạy tại CTU (4,1). Chọn cùng ứng viên trong hai lần chạy, phân rã ΔJ; sau đó mở “Luồng thử CU” và “Pixel 10-bit”.
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

# Chạy lại 8 cấu hình mẫu hiện tại (ID kết thúc bằng -ctu4-1)
python3 experiments.py --presets

# Chạy lại 9 cấu hình All Intra tại CTU (4,1)
python3 experiments.py --intra-presets

# Tạo lần chạy mới từ dòng lệnh
python3 experiments.py --config '{"qp":28,"esd":1,"ctuX":4,"ctuY":1}'

# Tạo lại toàn bộ demo từ input YUV đi kèm, gồm ảnh và bundle
./rebuild_demo.sh

# Kiểm tra dữ liệu các lần chạy đã lưu
python3 test_experiments.py
python3 test_intra.py
python3 test_inter.py
python3 test_intra_config.py
```

`run.sh` chỉ khởi động server, không tự build hoặc chạy lại preset. `--presets` thay thế tám preset Inter tại CTU (4,1); `--intra-presets` thay thế chín preset All Intra. `rebuild_demo.sh` chạy lại cả hai bộ. Tám bản lịch sử tại CTU (4,2) và các lần chạy có ID `run-...` được giữ lại.

## Cấu trúc repo

```text
server.py, experiments.py   Server cục bộ và bộ chạy thí nghiệm
enrich_rd_origins.py        Replay để bổ sung nguồn D/R cho dữ liệu cũ
enrich_intra.py, enrich_inter.py  Replay để bổ sung tìm kiếm Intra/Inter
INTRA_OPTIONS.md           Giải thích 8 tùy chọn Intra và cách làm thí nghiệm
build.sh, run.sh            Build encoder và mở Lab
rebuild_demo.sh             Tạo lại demo từ input đi kèm
web/                       Giao diện, 25 bộ kết quả, trace Intra/Inter và D/R chi tiết
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
- **Chưa ghi:** mọi điểm tìm kiếm integer ME, chi tiết scaling temporal và các nhánh reference bên trong AMVP, mọi lượt thử transform/quant và từng hệ số DCT/quant (đã ghi hình học TU được chọn để kiểm D). Giao diện không tạo số giả cho các bước đó.

`data/runs/<id>/` lưu YUV và trace thô. `web/runs/<id>/` lưu bundle, ảnh, log, command, cfg và bitstream để xem/tải. Hai file Python `experiments.py` và `server.py` tổ chức chạy encoder và cung cấp API. Server chỉ chạy một encode tại một thời điểm, kiểm tra miền tham số và gọi subprocess bằng danh sách đối số.

## Bản quyền và nguồn dữ liệu

Mã HM giữ giấy phép BSD trong [hm/COPYING](hm/COPYING). Hình demo có nguồn Pixabay và có điều khoản riêng. Xem [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) để biết phạm vi và nguồn dữ liệu.

Các tùy chọn Intra và ví dụ trình bày được giải thích trong [INTRA_OPTIONS.md](INTRA_OPTIONS.md). Bản chia sẻ kèm các bundle JSON chia theo tìm kiếm để xem/tải trace; các file thô `intra.jsonl` và `inter.jsonl` được tạo lại khi chạy encoder trên máy bạn.
