# Giải thích 8 tùy chọn Intra trong Inter Lab

Tài liệu dùng để đọc code và trình bày thí nghiệm trên **HM có sẵn trong `HEVC_Inter_Lab/hm`**. Các tùy chọn dưới đây được Inter Lab truyền thật vào encoder, không chỉ đổi giao diện.

Mở [Chạy cấu hình](http://127.0.0.1:5174/#experiments), chọn **All Intra · 5 I-frame** để tập trung vào Intra. Bộ mẫu dùng 5 frame, YUV420 10-bit, CTU quan sát mặc định (4,1), vùng luma (256,64), kích thước 64×64.

## 1. Bảng tổng hợp và cách hiểu giá trị mặc định

- `0`: tắt; `1`: bật đối với công tắc.
- **Mặc định khai báo HM:** giá trị trong `TAppEncCfg.cpp` khi chưa bị file cấu hình hoặc dòng lệnh ghi đè.
- **Mốc All Intra của Lab:** giá trị thực tế dùng cho bộ thí nghiệm All Intra QP 32.
- Giới hạn nhập trong bảng là giới hạn **giao diện/API Lab hiện tại**, không phải mọi giá trị HM có thể hỗ trợ trong mọi cấu hình.

| # | Tên trên giao diện | Option HM | Giá trị Lab cho nhập | Mặc định khai báo HM | Mốc All Intra |
| --- | --- | --- | --- | --- | --- |
| 1 | Sàng lọc có bổ sung MPM | `FastUDIUseMPMEnabled` | 0 / 1 | 1 | 1 |
| 2 | Strong intra smoothing | `StrongIntraSmoothing` | 0 / 1 | 1 | 1 |
| 3 | Độ sâu tối đa cây TU Intra | `QuadtreeTUMaxDepthIntra` | 1–5 | 1 | 3 |
| 4 | Transform skip | `TransformSkip` | 0 / 1 | 0 | 1 |
| 5 | Tìm transform skip nhanh | `TransformSkipFast` | 0 / 1 | 0 | 1 |
| 6 | RDOQ cho biến đổi thường | `RDOQ` | 0 / 1 | 1 | 1 |
| 7 | RDOQ cho transform skip | `RDOQTS` | 0 / 1 | 1 | 1 |
| 8 | Offset QP của I-frame | `IntraQPOffset` | −6…6 | 0 | 0 |

Ví dụ: HM khai báo `TransformSkip=0`, nhưng `encoder_intra_main10.cfg` bật nó thành 1; Lab tiếp tục truyền giá trị đang chọn qua dòng lệnh. Vì vậy cần xem **command thực tế** trong tab **Code & bằng chứng**, không chỉ nhìn một dòng khai báo mặc định.

Low Delay P/B cũ của Lab dùng `IntraQPOffset=-1`. Khi chọn All Intra hoặc điền một preset All Intra, Lab đặt offset về 0. QP cơ sở và cấu trúc GOP là các trường riêng, ngoài 8 option được giải thích ở đây.

## 2. Các option nằm ở đâu trong luồng encode?

```text
QP cơ sở + IntraQPOffset → QP I-frame → lượng tử và thiết lập lambda

Với một ứng viên CU Intra:
    Chuẩn bị mẫu tham chiếu đã tái tạo
        └─ StrongIntraSmoothing
    Sàng lọc 35 mode luma bằng chi phí nhanh
        └─ FastUDIUseMPMEnabled → danh sách mode đưa vào RD
    Với từng mode trong danh sách:
        Tạo prediction và residual
        Xét cây TU
            └─ QuadtreeTUMaxDepthIntra
        Với TU đủ điều kiện:
            Nhánh biến đổi thường → lượng tử dùng RDOQ
            Nhánh transform skip  → lượng tử dùng RDOQTS
                └─ TransformSkip cho phép nhánh này
                └─ TransformSkipFast giới hạn các trường hợp thử
        Tái tạo → tính D, ước lượng R → J → chọn phương án
    REFINE luma và tìm mode chroma theo luồng HM
    xCheckRDCostIntra: đánh giá D/R/J cả CU, so với best hiện tại
```

Đây là sơ đồ vị trí tác động; mã thật có đệ quy TU, vòng thử và sử dụng lại trạng thái CABAC/buffer.

Ở mức RD cả CU:

```text
J = D + lambda × R
```

- **D:** sai khác sau tái tạo; D toàn CU gồm Y và các phần Cb/Cr có trọng số theo HM.
- **R:** số bit ước lượng từ bộ đếm entropy trong lần thử; không phải kích thước file `.265` riêng của CU.
- **lambda:** hệ số cân bằng distortion và số bit.
- Chi phí sàng lọc nhanh, chi phí lượng tử và chi phí RD cuối CU có phạm vi khác nhau. Không cộng các chi phí trung gian để suy ra J cuối.

## 3. Option 1 — FastUDIUseMPMEnabled

### Ý nghĩa

**MPM — Most Probable Modes** là các mode dự đoán có xác suất cao, được HM suy ra từ thông tin lân cận và quy tắc dự phòng. Option này điều khiển cách lập danh sách mode luma để thử RD đầy đủ sau bước sàng lọc nhanh.

Trong cấu hình hiện tại, HM trước hết xét 35 mode luma: Planar, DC và 33 mode góc. Chi phí nhanh có dạng:

```text
J_fast = SATD(Original − Prediction) + sqrt(lambda) × R_mode
```

Tên biến distortion trong code là `uiSad`, nhưng các preset hiện tại dùng Hadamard nên phép đo ở bước này là SATD. Đây chưa phải D sau tái tạo.

### Bật và tắt khác nhau thế nào?

| Kích thước khối luma tìm mode | Bật: số mode cơ sở | Tắt: số mode cơ sở |
| --- | --- | --- |
| 4×4 | 8 | 9 |
| 8×8 | 8 | 9 |
| 16×16 | 3 | 4 |
| 32×32 | 3 | 4 |
| 64×64 | 3 | 5 |

**Bật (`1`):** giữ các mode nhanh tốt nhất theo cột “Bật”, rồi bổ sung những MPM được xét mà chưa nằm trong danh sách.

**Tắt (`0`):** dùng cột “Tắt” và bỏ bước bổ sung MPM.

Ví dụ minh họa với khối 32×32: danh sách cơ sở `[26, 10, 0]`; nếu vòng bổ sung xét MPM `[0, 1, 26]`, chỉ mode 1 cần thêm. Danh sách RD trở thành `[26, 10, 0, 1]`. Đây là ví dụ minh họa, không phải số liệu của một lượt trace cụ thể.

### Tác động và lưu ý

- Có thể thay đổi tập mode được thử, số lượt RD, mode thắng và D/R/J cuối.
- Tắt không đồng nghĩa ít lượt thử hơn, vì số mode cơ sở cũng đổi.
- Tắt **không** buộc HM thử RD đầy đủ cả 35 mode.
- Tắt bước bổ sung này **không** vô hiệu hóa cơ chế báo hiệu mode bằng MPM của HEVC. Một mode được chọn vẫn có thể thuộc MPM khi mã hóa cú pháp.

**Cách thử:** chọn preset **Không bổ sung MPM**, so với mốc; mở cùng POC/CU/PU ở tab Intra, đọc bảng FAST, MPM, SHORTLIST và các lượt RD luma.

**Code:** `TEncSearch::estIntraPredLumaQT` trong [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp); hai bảng `g_aucIntraModeNumFast_UseMPM` và `g_aucIntraModeNumFast_NotUseMPM` trong [TComRom.cpp](hm/source/Lib/TLibCommon/TComRom.cpp).

## 4. Option 2 — StrongIntraSmoothing

### Ý nghĩa

Cho phép làm mượt mạnh các mẫu **tham chiếu** dùng để dự đoán Intra luma. Những mẫu này lấy từ vùng lân cận đã tái tạo. Làm mượt mẫu tham chiếu có thể thay đổi prediction, rồi thay đổi residual và quyết định RD.

### Điều kiện áp dụng

Trong đường xử lý khối 32×32 của cấu hình hiện tại, bật option mới chỉ cho phép dùng strong smoothing. HM còn kiểm tra độ gần tuyến tính của dãy mẫu phía trên và bên trái, và mode dự đoán phải sử dụng bộ mẫu lọc tương ứng.

Kiểm tra độ tuyến tính có dạng:

```text
abs(đầu_dãy + cuối_dãy − 2 × mẫu_giữa) < threshold
threshold = 2^(bitDepth − 5)
```

Với 10-bit, ngưỡng này bằng 32. Cả phía trên và phía trái phải đạt điều kiện. Khi đạt, các mẫu lọc được tạo bằng nội suy giữa hai đầu dãy; trong nhánh lọc thông thường, HM sử dụng bộ lọc nhẹ hơn.

### Bật và tắt

- `1`: cho phép dùng strong smoothing khi đủ điều kiện.
- `0`: không dùng strong smoothing; bộ lọc tham chiếu thông thường vẫn có thể hoạt động.

Đây là xử lý **trước prediction**, khác deblocking/SAO của ảnh tái tạo. Không có nghĩa làm mờ toàn bộ frame đầu vào.

**Cách thử:** dùng preset **Tắt strong smoothing**, chọn lượt luma 32×32, so prediction và D/R/J. Kết quả có thể giống mốc nếu điều kiện không thỏa hoặc phương án bị ảnh hưởng không được chọn. Checkbox không chứng minh một lượt cụ thể đã dùng strong smoothing.

**Code:** `initIntraPatternChType` trong [TComPattern.cpp](hm/source/Lib/TLibCommon/TComPattern.cpp); bước sàng lọc trong [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp) cũng xử lý các mẫu tham chiếu cho tìm mode.

## 5. Option 3 — QuadtreeTUMaxDepthIntra

### Ý nghĩa

Giới hạn độ sâu cây **TU — Transform Unit** được phép dùng cho CU Intra. TU là vùng xử lý residual để biến đổi, lượng tử và tái tạo.

Cần phân biệt:

- **CU:** đơn vị quyết định mã hóa, có cây chia CU.
- **PU:** đơn vị prediction, ví dụ Intra 2Nx2N hoặc NxN.
- **TU:** đơn vị biến đổi residual, có cây chia TU trong CU.

Thay đổi option này điều chỉnh giới hạn cây TU; cây CU cuối có thể thay đổi gián tiếp vì chi phí các phương án CU thay đổi.

### Cách đọc các giá trị

Mốc Lab dùng `3`. Với CU Intra 2Nx2N kích thước 32×32, min TU 4×4 và max TU 32×32:

| Giá trị | Các kích thước TU có thể xét theo giới hạn độ sâu |
| --- | --- |
| 1 | 32×32 |
| 2 | 32×32, 16×16 |
| 3 | 32×32, 16×16, 8×8 |
| 4 | 32×32, 16×16, 8×8, 4×4 |
| 5 | Vẫn dừng ở 4×4 do giới hạn kích thước tối thiểu |

Bảng nói về phạm vi cho phép. Từng vòng tìm kiếm nhanh có thể xét ít hơn; cây cuối do RD lựa chọn.

Với CU 64×64, `depth=1` vẫn phải chia để đáp ứng **max TU 32×32**. Với Intra NxN, HM còn xét mức chia gắn với phân hoạch PU. Do đó không thể suy ra mọi cây TU chỉ bằng số depth mà bỏ qua kích thước CU/PU.

### Tác động

- Cho phép chia sâu hơn có thể biểu diễn residual cục bộ tốt hơn.
- Chia nhỏ cũng có chi phí báo hiệu cây TU, CBF và hệ số.
- HM so chi phí chia/không chia; tăng giới hạn không ép dùng cây sâu nhất và không bảo đảm D, R hoặc J toàn chuỗi giảm.

**Cách thử:** dùng preset **TU depth 1**, so với mốc depth 3. Đọc RD luma/TU của cùng CU, chi phí single/split và cây được chọn. Bảng “số nút TU trả kết quả” đếm cả các lần thử, cha và con; không phải số TU cuối và không được cộng D của mọi dòng TU.

**Code:** `TComDataCU::getQuadtreeTULog2MinSizeInCU` trong [TComDataCU.cpp](hm/source/Lib/TLibCommon/TComDataCU.cpp); tìm cây TU trong `xRecurIntraCodingLumaQT` của [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp).

## 6. Option 4 — TransformSkip

### Ý nghĩa

Cho phép HM thử nhánh bỏ phép biến đổi không gian cho residual của TU đủ điều kiện. Với Main10 hiện tại, kích thước đủ điều kiện tối đa là **4×4**.

```text
Nhánh thường:
    residual → transform → quant → inverse quant → inverse transform

Nhánh transform skip:
    residual → xử lý scale theo HM → quant → inverse quant → khôi phục scale
```

Cả hai nhánh đều dùng residual tái tạo cộng với prediction để tạo reconstruction. Transform skip có thể hữu ích với một số cấu trúc residual của nội dung đồ họa, nhưng kết quả phải xem từ RD thật.

### Bật và tắt

- `1`: cho phép thử thêm nhánh transform skip khi đủ điều kiện; HM vẫn chọn theo chi phí.
- `0`: bỏ nhánh transform skip trong tìm kiếm thông thường.

Bật không có nghĩa mọi TU đều bỏ transform. Transform skip vẫn có lượng tử và mã hóa residual nên **không mặc nhiên lossless**. Nó cũng khác **CU Skip của Inter**, nơi residual không được truyền.

**Cách thử:** dùng preset **Tắt transform skip**; so CU nhỏ và D/R/J với mốc. Có thể thấy mode hoặc cây TU cuối thay đổi. Trace hiện tại chưa ghi riêng toàn bộ các lượt thử transform skip bên trong một mode, nên không dùng số lượt RD luma làm số lần thử transform skip.

**Code:** điều kiện `checkTransformSkip` và vòng `modeId` trong [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp); xử lý transform/quant trong [TComTrQuant.cpp](hm/source/Lib/TLibCommon/TComTrQuant.cpp).

## 7. Option 5 — TransformSkipFast

### Ý nghĩa

Giảm số trường hợp thử transform skip bằng quy tắc tìm kiếm nhanh. Có tác dụng khi `TransformSkip=1`.

Trong đường tìm Intra của code hiện tại:

- **Luma:** khi bật Fast, HM chỉ cho xét transform skip nếu CU có phân hoạch `SIZE_NxN`, đồng thời vẫn phải đạt điều kiện kích thước TU và các điều kiện khác.
- **Chroma:** khi bật Fast, HM kiểm thêm kích thước luma tương ứng và yêu cầu có ít nhất một phần luma liên quan đã chọn transform skip.

### Bật và tắt

- `1`: áp dụng các hạn chế trên để giảm công việc tìm kiếm.
- `0`: bỏ các hạn chế nhanh này, mở rộng các trường hợp được thử; điều kiện cơ bản của transform skip vẫn còn.

Tắt Fast không tắt TransformSkip. Nếu `TransformSkip=0`, đổi Fast không mở lại được nhánh transform skip.

**Cách thử:** chọn preset **Mở rộng thử transform skip**, tức TS=1 và Fast=0, so với mốc TS=1/Fast=1. Quan sát kết quả RD và cây cuối. Không bảo đảm bitstream đổi; thời gian đo có trace chỉ mang tính tham khảo.

**Code:** `getUseTransformSkipFast()` trong `xRecurIntraCodingLumaQT` và `xRecurIntraChromaCodingQT` của [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp).

## 8. Option 6 — RDOQ

### Ý nghĩa

**RDOQ — Rate-Distortion Optimized Quantization** là lượng tử hóa có xét đánh đổi giữa sai số và số bit mã hóa hệ số. Option `RDOQ` áp dụng cho nhánh **biến đổi thường**.

Thay vì chỉ dựa vào quy tắc lượng tử thông thường, RDOQ cân nhắc các mức hệ số, khả năng đưa hệ số về 0 và chi phí báo hiệu liên quan để giảm mục tiêu RD của bước lượng tử.

Ví dụ định tính: một hệ số gần ngưỡng có thể được đưa về 0 nếu số bit tiết kiệm bù được sai số tăng thêm. Không phải cứ bật RDOQ thì mọi hệ số đều nhỏ hơn.

### Bật và tắt

- `1`: cho phép dùng thuật toán RDOQ cho TU dùng transform thường.
- `0`: dùng nhánh lượng tử thông thường cho các TU này.

Tắt RDOQ **không tắt vòng RD chọn mode/TU/CU**. Encoder vẫn tính D/R/J để so các phương án; chỉ cách tạo mức hệ số lượng tử thay đổi.

RDOQ có thể đổi hệ số, CBF, bit residual, reconstruction, D và cả mode/TU thắng. D có thể tăng trong khi mục tiêu RD tốt hơn. Đây cũng là tùy chọn có thể tác động residual Inter khi chọn GOP P/B.

**Cách thử:** nếu muốn cô lập nhánh thường, chỉ tắt RDOQ và giữ RDOQTS. Preset **Tắt RDOQ cả hai nhánh** tắt cả hai công tắc nên đo tác động kết hợp.

**Code:** `TComTrQuant::xQuant` chọn nhánh, `xRateDistOptQuant` thực hiện RDOQ trong [TComTrQuant.cpp](hm/source/Lib/TLibCommon/TComTrQuant.cpp). Chi phí nội bộ của lượng tử không phải J cuối toàn CU.

## 9. Option 7 — RDOQTS

### Ý nghĩa

Điều khiển RDOQ riêng cho nhánh **transform skip**. Hai công tắc RDOQ và RDOQTS độc lập tại chỗ chọn thuật toán lượng tử:

```cpp
Bool useRDOQ = useTransformSkip ? m_useRDOQTS : m_useRDOQ;
```

| RDOQ | RDOQTS | TU biến đổi thường | TU transform skip |
| --- | --- | --- | --- |
| 1 | 1 | RDOQ | RDOQ |
| 1 | 0 | RDOQ | Lượng tử thông thường |
| 0 | 1 | Lượng tử thông thường | RDOQ |
| 0 | 0 | Lượng tử thông thường | Lượng tử thông thường |

Bảng mô tả lựa chọn giữa hai công tắc; việc một TU cụ thể được xét còn phụ thuộc các điều kiện trong HM.

Nếu `TransformSkip=0`, RDOQTS không tác động đến kết quả vì không có nhánh transform skip để dùng. Nếu bật TS nhưng nhánh này không thắng, thay RDOQTS vẫn có thể đổi chi phí ứng viên mà cuối cùng cho cùng bitstream.

**Cách thử:** giữ TS=1, giữ RDOQ=1, chỉ đổi RDOQTS 1→0. Để thấy nhiều trường hợp TS được xét hơn, có thể tạo một cặp cấu hình đều Fast=0, rồi chỉ đổi RDOQTS giữa hai cấu hình đó.

**Code:** cùng `TComTrQuant::xQuant` trong [TComTrQuant.cpp](hm/source/Lib/TLibCommon/TComTrQuant.cpp).

## 10. Option 8 — IntraQPOffset

### Ý nghĩa

Là số cộng thêm vào QP của **I-slice**. Với bộ All Intra hiện tại, QP nguyên và không có hiệu chỉnh QP khác:

```text
QP_I = clip(QP_cơ_sở + IntraQPOffset, −12, 51)
```

Miền clip trên là miền QP luma với 10-bit trong cấu hình đang dùng. Các thiết lập HM khác có thể thêm hiệu chỉnh QP; công thức trên mô tả các thí nghiệm Lab hiện tại.

Ví dụ với QP cơ sở 32:

| Offset | QP của I-frame |
| --- | --- |
| −1 | 31 |
| 0 | 32 |
| +1 | 33 |
| +3 | 35 |

Ở All Intra, cả 5 frame đều là I nên đều nhận offset này. Với Low Delay P/B, nó áp dụng cho I-slice, còn QP P/B được tính theo bảng GOP và các quy tắc tương ứng. Một CU Intra nằm trong P/B-slice không nhận thêm offset này chỉ vì mode CU là Intra.

### Tác động đến số liệu

QP hiệu dụng thay đổi làm thay đổi lượng tử và thiết lập lambda. Với các điều kiện của preset Lab hiện tại (`LambdaFromQpEnable=1`, 10-bit và các hệ số đang dùng), công thức rút gọn được giao diện đối chiếu với trace là:

```text
lambda = 0.57 × 2^(QP_frame / 3)
```

Tăng QP hiệu dụng thêm 3 làm lambda theo công thức này tăng gấp đôi. Điều này tăng trọng số của R trong `J = D + lambda × R`; không có nghĩa bitrate giảm chính xác một nửa hay D tăng chính xác gấp đôi.

**Cách thử:** giữ QP cơ sở 32, so offset 0 với +1; mở log và bảng **QP cơ sở → QP frame → lambda**. Đã có lần chạy kiểm tra từ giao diện cho ra cả 5 I-frame ở QP 33 khi đặt offset +1.

**Code:** `TEncTop::getQPForPicture` trong [TEncTop.cpp](hm/source/Lib/TLibEncoder/TEncTop.cpp) cộng offset khi `sliceType == I_SLICE`, sau đó clip; [TEncSlice.cpp](hm/source/Lib/TLibEncoder/TEncSlice.cpp) thiết lập lambda.

## 11. Cách làm thí nghiệm và giải thích khi trình bày

### Cấu hình mốc

```text
GOP: All Intra
QP cơ sở: 32
FastUDIUseMPMEnabled: 1
StrongIntraSmoothing: 1
QuadtreeTUMaxDepthIntra: 3
TransformSkip: 1
TransformSkipFast: 1
RDOQ: 1
RDOQTS: 1
IntraQPOffset: 0
CTU: (4,1)
```

### Quy trình cho mỗi thí nghiệm

1. Giữ cùng input, POC và CTU; lấy mốc làm A.
2. Tạo B chỉ đổi option cần giải thích. Nếu đổi một nhóm, ghi rõ các giá trị cùng đổi.
3. Mở **Code & bằng chứng** để xác nhận command thật, QP frame và log.
4. Mở **So sánh A/B**: xem bitrate, PSNR, ảnh cùng CTU và khối lượng tìm kiếm Intra.
5. Mở **Intra chuyên sâu** ở cùng CU, phân hoạch và PU: tìm bước bắt đầu thay đổi, rồi theo đến kết quả cuối.
6. Ghi cả trường hợp kết quả giống nhau: option có thể chưa tác động tại vùng đang quan sát hoặc các ứng viên thay đổi vẫn không thắng.

Mẫu câu giải thích:

> “Em đổi [option] từ [A] sang [B]. Trong HM, option này tác động ở bước […]. Tại POC/CU/PU đang xét, em quan sát được […] thay đổi. Sau tái tạo và đếm bit, D/R/J là […]. Phương án này được nhận ở lượt thử, rồi em đối chiếu thêm cây cuối để xác nhận nó có được giữ lại hay không.”

### Các kết luận cần phân biệt

- D của một ứng viên CU khác PSNR toàn frame; ảnh WebP chỉ để quan sát, không dùng tính lại D 10-bit.
- Số lượt thử trong CTU khác số mode/TU cuối và khác thời gian encode toàn chuỗi.
- `accepted` nghĩa là thắng best tại thời điểm thử; ứng viên vẫn có thể bị lượt khác hoặc phương án chia CU thay thế.
- Đổi QP có thể đổi cả lambda. Khi giải thích ΔJ, cần đọc đủ D, R và lambda của từng cấu hình.
- Bộ trace hiện tại có mode, cây TU và D/R/J, nhưng chưa có mọi hệ số lượng tử hoặc mọi lần thử transform skip bên trong mode.

## 12. Các file nguồn để đối chiếu

- [Danh mục 8 option và preset của giao diện](web/intra-config.json).
- [experiments.py](experiments.py): kiểm tra miền giá trị và tạo tham số dòng lệnh cho HM.
- [TAppEncCfg.cpp](hm/source/App/TAppEncoder/TAppEncCfg.cpp): khai báo option và mặc định HM.
- [encoder_intra_main10.cfg](hm/cfg/encoder_intra_main10.cfg): cấu hình All Intra nền.
- [TEncSearch.cpp](hm/source/Lib/TLibEncoder/TEncSearch.cpp): tìm mode, cây TU và các nhánh transform skip.
- [TComRom.cpp](hm/source/Lib/TLibCommon/TComRom.cpp): bảng số mode sàng lọc.
- [TComPattern.cpp](hm/source/Lib/TLibCommon/TComPattern.cpp): mẫu tham chiếu và smoothing.
- [TComDataCU.cpp](hm/source/Lib/TLibCommon/TComDataCU.cpp): giới hạn TU trong CU.
- [TComTrQuant.cpp](hm/source/Lib/TLibCommon/TComTrQuant.cpp): biến đổi và lượng tử.
- [TEncTop.cpp](hm/source/Lib/TLibEncoder/TEncTop.cpp), [TEncSlice.cpp](hm/source/Lib/TLibEncoder/TEncSlice.cpp): QP và lambda.
