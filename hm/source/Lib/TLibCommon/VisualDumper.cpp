#include "VisualDumper.h"
#include "TComDataCU.h"
#include "TComPic.h"
#include "TComSlice.h"
#include "TComRom.h"
#include <sys/stat.h>
#include <sstream>
#include <cstdlib>
#include <iomanip>
#include <cmath>
#include "TComYuv.h"

VisualDumper* VisualDumper::s_instance = NULL;

VisualDumper::VisualDumper() {
    const char* envX = getenv("VISUAL_CTU_X");
    const char* envY = getenv("VISUAL_CTU_Y");
    const char* envCuSize = getenv("VISUAL_CU_SIZE");
    const char* envExit = getenv("VISUAL_DUMP_EXIT");
    const char* envPOC = getenv("VISUAL_POC");

    // Only enable if explicit CTU coordinate is passed in environment
    m_enabled = (envX != NULL && envY != NULL);
    m_exitOnFinish = (envExit != NULL) ? (atoi(envExit) != 0) : true;

    m_targetPOC = envPOC ? atoi(envPOC) : 0;
    m_targetCtuX = envX ? atoi(envX) : 0;
    m_targetCtuY = envY ? atoi(envY) : 0;
    m_targetCuSize = envCuSize ? atoi(envCuSize) : 8;
    
    m_currentPOC = -1;
    m_currentCtuX = -1;
    m_currentCtuY = -1;
    m_dumpCount = 0;
    m_intraSearchCount = 0;
    m_intraRefDumped = false;

    if (m_enabled) {
        const char* envOutDir = getenv("VISUAL_OUTPUT_DIR");
        if (envOutDir != NULL && std::string(envOutDir).length() > 0) {
            m_outputDir = envOutDir;
            if (m_outputDir[m_outputDir.length() - 1] != '/') {
                m_outputDir += "/";
            }
        } else {
            m_outputDir = "dump_data/";
        }
        mkdir(m_outputDir.c_str(), 0777);
        m_outFile.open((m_outputDir + "trace.jsonl").c_str(), std::ios::out | std::ios::trunc);
    }
}

VisualDumper::~VisualDumper() {
    if (m_outFile.is_open()) {
        m_outFile.close();
    }
}

Void VisualDumper::dumpIntraRefSamples(Int cuSize,
                                       const Pel* pRefUnfilt, const Pel* pRefFilt, Int refStride,
                                       Bool strongIntraSmoothing,
                                       const Pel* pRefUnfiltU, const Pel* pRefUnfiltV,
                                       const Pel* pRefFiltU, const Pel* pRefFiltV, Int refStrideC) {
    if (!m_enabled || !m_outFile.is_open()) return;
    
    std::stringstream ss;
    ss << "{";
    ss << "\"poc\":" << m_currentPOC << ",";
    ss << "\"ctu_x\":" << m_currentCtuX << ",";
    ss << "\"ctu_y\":" << m_currentCtuY << ",";
    ss << "\"cu_size\":" << cuSize << ",";
    ss << "\"event\":\"INTRA_REF_SAMPLES\",";
    ss << "\"strong_smoothing\":" << (strongIntraSmoothing ? "true" : "false") << ",";

    // Unfiltered Luma Top (2N + 1)
    ss << "\"ref_unfilt_top\":[";
    if (pRefUnfilt) {
        for(int i = 0; i <= 2 * cuSize; i++) ss << pRefUnfilt[i] << (i < 2 * cuSize ? "," : "");
    }
    ss << "],";

    // Unfiltered Luma Left (2N + 1)
    ss << "\"ref_unfilt_left\":[";
    if (pRefUnfilt) {
        for(int i = 0; i <= 2 * cuSize; i++) ss << pRefUnfilt[i * refStride] << (i < 2 * cuSize ? "," : "");
    }
    ss << "],";

    // Filtered Luma Top (2N + 1)
    ss << "\"ref_filt_top\":[";
    if (pRefFilt) {
        for(int i = 0; i <= 2 * cuSize; i++) ss << pRefFilt[i] << (i < 2 * cuSize ? "," : "");
    }
    ss << "],";

    // Filtered Luma Left (2N + 1)
    ss << "\"ref_filt_left\":[";
    if (pRefFilt) {
        for(int i = 0; i <= 2 * cuSize; i++) ss << pRefFilt[i * refStride] << (i < 2 * cuSize ? "," : "");
    }
    ss << "],";

    Int cSize = cuSize / 2;
    Int rStrideC = (refStrideC > 0) ? refStrideC : (2 * cSize + 1);

    // Chroma U Unfiltered Top / Left
    ss << "\"ref_unfilt_top_u\":[";
    if (pRefUnfiltU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefUnfiltU[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    ss << "\"ref_unfilt_left_u\":[";
    if (pRefUnfiltU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefUnfiltU[i * rStrideC] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";

    // Chroma V Unfiltered Top / Left
    ss << "\"ref_unfilt_top_v\":[";
    if (pRefUnfiltV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefUnfiltV[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    ss << "\"ref_unfilt_left_v\":[";
    if (pRefUnfiltV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefUnfiltV[i * rStrideC] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";

    // Chroma U Filtered Top / Left
    ss << "\"ref_filt_top_u\":[";
    if (pRefFiltU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefFiltU[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    ss << "\"ref_filt_left_u\":[";
    if (pRefFiltU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefFiltU[i * rStrideC] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";

    // Chroma V Filtered Top / Left
    ss << "\"ref_filt_top_v\":[";
    if (pRefFiltV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefFiltV[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    ss << "\"ref_filt_left_v\":[";
    if (pRefFiltV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefFiltV[i * rStrideC] << (i < 2 * cSize ? "," : "");
    }
    ss << "]";

    ss << "}\n";
    m_outFile << ss.str();
    m_outFile.flush();
    m_intraRefDumped = true;
}

Void VisualDumper::dumpIntraSearchStep(Int cuSize, Int mode, Double cost, Bool bUseFilter,
                                       const Pel* pOrg, const Pel* pPred, const Pel* pResi, Int stride,
                                       const Pel* pRef, Int refStride,
                                       const Pel* pOrgU, const Pel* pOrgV,
                                       const Pel* pPredU, const Pel* pPredV,
                                       Int strideC, Int predStrideC,
                                       const Pel* pRefU, const Pel* pRefV) {
    if (!m_enabled || !m_outFile.is_open() || !pOrg || !pPred) return;
    
    std::stringstream ss;
    ss << "{";
    ss << "\"poc\":" << m_currentPOC << ",";
    ss << "\"ctu_x\":" << m_currentCtuX << ",";
    ss << "\"ctu_y\":" << m_currentCtuY << ",";
    ss << "\"cu_size\":" << cuSize << ",";
    ss << "\"event\":\"RDO_INTRA_SEARCH\",";
    ss << "\"mode\":" << mode << ",";
    ss << "\"cost\":" << cost << ",";
    ss << "\"b_use_filter\":" << (bUseFilter ? "true" : "false") << ",";
    
    // Dump Original
    ss << "\"org_data\":[";
    for(Int y=0; y<cuSize; y++) {
        for(Int x=0; x<cuSize; x++) {
            ss << pOrg[y*stride + x];
            if(y != cuSize-1 || x != cuSize-1) ss << ",";
        }
    }
    ss << "],";
    
    // Dump Prediction
    ss << "\"pred_data\":[";
    for(Int y=0; y<cuSize; y++) {
        for(Int x=0; x<cuSize; x++) {
            ss << pPred[y*stride + x];
            if(y != cuSize-1 || x != cuSize-1) ss << ",";
        }
    }
    ss << "],";
    
    // Dump Residual (Org - Pred or use pResi if available)
    ss << "\"resi_data\":[";
    for(Int y=0; y<cuSize; y++) {
        for(Int x=0; x<cuSize; x++) {
            Int resi = pResi ? pResi[y*stride + x] : (pOrg[y*stride + x] - pPred[y*stride + x]);
            ss << resi;
            if(y != cuSize-1 || x != cuSize-1) ss << ",";
        }
    }
    ss << "],";

    // Dump Reference Pixels (Top)
    ss << "\"ref_top\":[";
    if (pRef) {
        for(int i = 0; i <= 2 * cuSize; i++) {
            ss << pRef[i] << (i < 2 * cuSize ? "," : "");
        }
    }
    ss << "],";

    // Dump Reference Pixels (Left)
    ss << "\"ref_left\":[";
    if (pRef) {
        for(int i = 0; i <= 2 * cuSize; i++) {
            ss << pRef[i * refStride] << (i < 2 * cuSize ? "," : "");
        }
    }
    ss << "],";
    
    Int cSize = cuSize / 2;
    Int pStrideC = (predStrideC > 0) ? predStrideC : strideC;

    // Dump Original U (Cb)
    ss << "\"org_u\":[";
    if (pOrgU) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << pOrgU[y*strideC + x];
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Original V (Cr)
    ss << "\"org_v\":[";
    if (pOrgV) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << pOrgV[y*strideC + x];
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Prediction U (Cb)
    ss << "\"pred_u\":[";
    if (pPredU) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << pPredU[y*pStrideC + x];
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Prediction V (Cr)
    ss << "\"pred_v\":[";
    if (pPredV) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << pPredV[y*pStrideC + x];
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Residual U (Cb)
    ss << "\"resi_u\":[";
    if (pOrgU && pPredU) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << (pOrgU[y*strideC + x] - pPredU[y*pStrideC + x]);
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Residual V (Cr)
    ss << "\"resi_v\":[";
    if (pOrgV && pPredV) {
        for(Int y=0; y<cSize; y++) {
            for(Int x=0; x<cSize; x++) {
                ss << (pOrgV[y*strideC + x] - pPredV[y*pStrideC + x]);
                if(y != cSize-1 || x != cSize-1) ss << ",";
            }
        }
    }
    ss << "],";
    
    // Dump Ref U Top
    ss << "\"ref_top_u\":[";
    if (pRefU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefU[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    
    // Dump Ref U Left
    ss << "\"ref_left_u\":[";
    if (pRefU) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefU[i * (2 * cSize + 1)] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    
    // Dump Ref V Top
    ss << "\"ref_top_v\":[";
    if (pRefV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefV[i] << (i < 2 * cSize ? "," : "");
    }
    ss << "],";
    
    // Dump Ref V Left
    ss << "\"ref_left_v\":[";
    if (pRefV) {
        for(int i = 0; i <= 2 * cSize; i++) ss << pRefV[i * (2 * cSize + 1)] << (i < 2 * cSize ? "," : "");
    }
    ss << "]";
    
    ss << "}\n";
    
    m_outFile << ss.str();
    m_outFile.flush(); // ensure it's written immediately

    m_intraSearchCount++;
}

static const char* visualPartSize(PartSize size) {
    switch (size) {
      case SIZE_2Nx2N: return "2Nx2N";
      case SIZE_2NxN: return "2NxN";
      case SIZE_Nx2N: return "Nx2N";
      case SIZE_NxN: return "NxN";
      case SIZE_2NxnU: return "2NxnU";
      case SIZE_2NxnD: return "2NxnD";
      case SIZE_nLx2N: return "nLx2N";
      case SIZE_nRx2N: return "nRx2N";
      default: return "unknown";
    }
}

static Void dumpCUNode(std::stringstream& ss, TComDataCU* pcCU, UInt absPartIdx, UInt depth, Bool& first) {
    const TComSPS& sps = *(pcCU->getSlice()->getSPS());
    UInt maxCUWidth = sps.getMaxCUWidth();
    UInt maxCUHeight = sps.getMaxCUHeight();
    UInt curW = maxCUWidth >> depth;
    UInt curH = maxCUHeight >> depth;
    UInt x = pcCU->getCUPelX() + g_auiRasterToPelX[ g_auiZscanToRaster[absPartIdx] ];
    UInt y = pcCU->getCUPelY() + g_auiRasterToPelY[ g_auiZscanToRaster[absPartIdx] ];

    if (x >= sps.getPicWidthInLumaSamples() || y >= sps.getPicHeightInLumaSamples()) return;

    UChar cuDepth = pcCU->getDepth(absPartIdx);
    Bool isSplit = (depth < cuDepth) && (depth < sps.getLog2DiffMaxMinCodingBlockSize());

    if (!first) ss << ",";
    first = false;

    ss << "{";
    ss << "\"depth\":" << depth << ",";
    ss << "\"x\":" << x << ",";
    ss << "\"y\":" << y << ",";
    ss << "\"width\":" << curW << ",";
    ss << "\"height\":" << curH << ",";
    ss << "\"split\":" << (isSplit ? "true" : "false");

    if (!isSplit) {
        PredMode predMode = pcCU->getPredictionMode(absPartIdx);
        const char* modeStr = pcCU->getSkipFlag(absPartIdx) ? "SKIP" : ((predMode == MODE_INTRA) ? "INTRA" : "INTER");
        ss << ",\"mode\":\"" << modeStr << "\"";
        if (predMode == MODE_INTRA) {
            ss << ",\"intra_dir\":" << (Int)pcCU->getIntraDir(CHANNEL_TYPE_LUMA, absPartIdx);
            PartSize shape = pcCU->getPartitionSize(absPartIdx);
            ss << ",\"part_size\":\"" << visualPartSize(shape) << "\"";
            UInt count = shape == SIZE_NxN ? 4 : 1;
            UInt partsPerSide = 1;
            while (partsPerSide*partsPerSide < pcCU->getPic()->getNumPartitionsInCtu()) partsPerSide++;
            UInt minPart = maxCUWidth / partsPerSide;
            ss << ",\"pus\":[";
            for (UInt i=0; i<count; i++) {
                if (i) ss << ",";
                UInt px = x + (shape == SIZE_NxN ? (i%2)*(curW/2) : 0);
                UInt py = y + (shape == SIZE_NxN ? (i/2)*(curH/2) : 0);
                UInt raster = ((py-pcCU->getCUPelY())/minPart)*partsPerSide + (px-pcCU->getCUPelX())/minPart;
                UInt partIdx = g_auiRasterToZscan[raster];
                ss << "{\"x\":" << px << ",\"y\":" << py
                   << ",\"width\":" << (shape == SIZE_NxN ? curW/2 : curW)
                   << ",\"height\":" << (shape == SIZE_NxN ? curH/2 : curH)
                   << ",\"intra_dir\":" << (Int)pcCU->getIntraDir(CHANNEL_TYPE_LUMA, partIdx) << "}";
            }
            ss << "]";
        } else {
            PartSize shape = pcCU->getPartitionSize(absPartIdx);
            ss << ",\"part_size\":\"" << visualPartSize(shape) << "\"";
            UInt px[4] = {x, x, x, x}, py[4] = {y, y, y, y};
            UInt pw[4] = {curW, 0, 0, 0}, ph[4] = {curH, 0, 0, 0};
            UInt count = 1;
            if (shape == SIZE_2NxN || shape == SIZE_Nx2N || shape == SIZE_2NxnU || shape == SIZE_2NxnD || shape == SIZE_nLx2N || shape == SIZE_nRx2N) count = 2;
            if (shape == SIZE_NxN) count = 4;
            if (shape == SIZE_2NxN) { ph[0] = curH/2; py[1] = y+ph[0]; pw[1] = curW; ph[1] = curH-ph[0]; }
            if (shape == SIZE_Nx2N) { pw[0] = curW/2; px[1] = x+pw[0]; pw[1] = curW-pw[0]; ph[1] = curH; }
            if (shape == SIZE_2NxnU) { ph[0] = curH/4; py[1] = y+ph[0]; pw[1] = curW; ph[1] = curH-ph[0]; }
            if (shape == SIZE_2NxnD) { ph[0] = curH*3/4; py[1] = y+ph[0]; pw[1] = curW; ph[1] = curH-ph[0]; }
            if (shape == SIZE_nLx2N) { pw[0] = curW/4; px[1] = x+pw[0]; pw[1] = curW-pw[0]; ph[1] = curH; }
            if (shape == SIZE_nRx2N) { pw[0] = curW*3/4; px[1] = x+pw[0]; pw[1] = curW-pw[0]; ph[1] = curH; }
            if (shape == SIZE_NxN) {
                for (UInt i=0; i<4; i++) {
                    px[i] = x + (i%2)*(curW/2); py[i] = y + (i/2)*(curH/2);
                    pw[i] = curW/2; ph[i] = curH/2;
                }
            }
            UInt partsPerSide = 1;
            while (partsPerSide*partsPerSide < pcCU->getPic()->getNumPartitionsInCtu()) partsPerSide++;
            UInt minPart = maxCUWidth / partsPerSide;
            ss << ",\"pus\":[";
            for (UInt i=0; i<count; i++) {
                if (i) ss << ",";
                UInt raster = ((py[i]-pcCU->getCUPelY())/minPart)*partsPerSide + (px[i]-pcCU->getCUPelX())/minPart;
                UInt partIdx = g_auiRasterToZscan[raster];
                ss << "{\"x\":" << px[i] << ",\"y\":" << py[i] << ",\"width\":" << pw[i] << ",\"height\":" << ph[i];
                ss << ",\"inter_dir\":" << (Int)pcCU->getInterDir(partIdx);
                ss << ",\"merge\":" << (pcCU->getMergeFlag(partIdx) ? "true" : "false");
                ss << ",\"merge_idx\":" << (Int)pcCU->getMergeIndex(partIdx);
                ss << ",\"skip\":" << (pcCU->getSkipFlag(partIdx) ? "true" : "false");
                for (Int list=0; list<2; list++) {
                    RefPicList refList = list == 0 ? REF_PIC_LIST_0 : REF_PIC_LIST_1;
                    const TComCUMvField* field = pcCU->getCUMvField(refList);
                    Int refIdx = field->getRefIdx(partIdx);
                    ss << ",\"l" << list << "\":{\"ref_idx\":" << refIdx;
                    if (refIdx >= 0 && refIdx < pcCU->getSlice()->getNumRefIdx(refList)) {
                        ss << ",\"ref_poc\":" << pcCU->getSlice()->getRefPic(refList, refIdx)->getPOC();
                        ss << ",\"mv_x_qpel\":" << field->getMv(partIdx).getHor();
                        ss << ",\"mv_y_qpel\":" << field->getMv(partIdx).getVer();
                        ss << ",\"mvd_x_qpel\":" << field->getMvd(partIdx).getHor();
                        ss << ",\"mvd_y_qpel\":" << field->getMvd(partIdx).getVer();
                        ss << ",\"mvp_idx\":" << pcCU->getMVPIdx(refList, partIdx);
                    }
                    ss << "}";
                }
                ss << "}";
            }
            ss << "]";
        }
        ss << ",\"qp\":" << (Int)pcCU->getQP(absPartIdx);
        ss << ",\"cost\":" << pcCU->getTotalCost();
    }
    ss << "}";

    if (isSplit) {
        UInt qNumParts = ( pcCU->getPic()->getNumPartitionsInCtu() >> (depth << 1) ) >> 2;
        for (UInt i = 0; i < 4; i++) {
            dumpCUNode(ss, pcCU, absPartIdx + i * qNumParts, depth + 1, first);
        }
    }
}

Void VisualDumper::dumpPartitionTree(TComDataCU* pcCU) {
    if (!m_enabled || !m_outFile.is_open() || !pcCU) return;
    const TComSPS& sps = *(pcCU->getSlice()->getSPS());
    UInt maxCUWidth = sps.getMaxCUWidth();
    Int poc = pcCU->getSlice()->getPOC();
    Int ctuX = pcCU->getCUPelX() / maxCUWidth;
    Int ctuY = pcCU->getCUPelY() / maxCUWidth;

    if (m_targetPOC >= 0 && poc != m_targetPOC) return;

    std::stringstream ss;
    ss << "{";
    ss << "\"poc\":" << poc << ",";
    ss << "\"slice_type\":\"" << (pcCU->getSlice()->isIntra() ? "I" : (pcCU->getSlice()->isInterP() ? "P" : "B")) << "\",";
    ss << "\"ctu_x\":" << ctuX << ",";
    ss << "\"ctu_y\":" << ctuY << ",";
    ss << "\"cu_size\":" << maxCUWidth << ",";
    ss << "\"event\":\"CTU_PARTITION\",";
    ss << "\"nodes\":[";
    Bool first = true;
    dumpCUNode(ss, pcCU, 0, 0, first);
    ss << "]}\n";

    m_outFile << ss.str();
    m_outFile.flush();
}

Void VisualDumper::dumpTransformQuant(Int poc, Int ctuX, Int ctuY, Int tuX, Int tuY, Int tuWidth, Int tuHeight,
                                     Int compID, Int qp,
                                     const Pel* pResi, Int resiStride,
                                     const TCoeff* pDctCoeff, const TCoeff* pQCoeff) {
    if (!m_enabled || !m_outFile.is_open()) return;
    if (poc != m_targetPOC || ctuX != m_targetCtuX || ctuY != m_targetCtuY) return;
    Int expectedWidth = (compID == 0) ? m_targetCuSize : (m_targetCuSize >> 1);
    if (tuWidth != expectedWidth) return;

    std::stringstream ss;
    ss << "{";
    ss << "\"poc\":" << poc << ",";
    ss << "\"ctu_x\":" << ctuX << ",";
    ss << "\"ctu_y\":" << ctuY << ",";
    ss << "\"tu_x\":" << tuX << ",";
    ss << "\"tu_y\":" << tuY << ",";
    ss << "\"width\":" << tuWidth << ",";
    ss << "\"height\":" << tuHeight << ",";
    ss << "\"cu_size\":" << m_targetCuSize << ",";
    ss << "\"event\":\"TRANSFORM_QUANT\",";
    const char* compNames[] = {"Y", "Cb", "Cr"};
    ss << "\"component\":\"" << (compID >= 0 && compID < 3 ? compNames[compID] : "Y") << "\",";
    ss << "\"qp\":" << qp << ",";

    ss << "\"resi_matrix\":[";
    if (pResi) {
        for (Int y = 0; y < tuHeight; y++) {
            for (Int x = 0; x < tuWidth; x++) {
                ss << pResi[y * resiStride + x];
                if (y != tuHeight - 1 || x != tuWidth - 1) ss << ",";
            }
        }
    }
    ss << "],";

    Int sigCount = 0;
    ss << "\"dct_coeff\":[";
    if (pDctCoeff) {
        for (Int i = 0; i < tuWidth * tuHeight; i++) {
            ss << pDctCoeff[i];
            if (i < tuWidth * tuHeight - 1) ss << ",";
        }
    }
    ss << "],";

    ss << "\"quant_coeff\":[";
    if (pQCoeff) {
        for (Int i = 0; i < tuWidth * tuHeight; i++) {
            ss << pQCoeff[i];
            if (pQCoeff[i] != 0) sigCount++;
            if (i < tuWidth * tuHeight - 1) ss << ",";
        }
    }
    ss << "],";
    ss << "\"sig_coeff_count\":" << sigCount;
    ss << "}\n";

    m_outFile << ss.str();
    m_outFile.flush();
}

// Inter Lab observes RD decisions; it never changes encoder state.
Bool VisualDumper::labActive(TComDataCU* cu) {
    if (!m_enabled || !getenv("INTER_LAB_TRACE")) return false;
    const char* ex = getenv("INTER_LAB_CTU_X");
    const char* ey = getenv("INTER_LAB_CTU_Y");
    Int x = ex ? atoi(ex) : 4, y = ey ? atoi(ey) : 2;
    if (Int(cu->getCUPelX()/64) != x || Int(cu->getCUPelY()/64) != y) return false;
    if (!m_labFile.is_open()) m_labFile.open((m_outputDir+"decisions.jsonl").c_str());
    return m_labFile.is_open();
}

Void VisualDumper::dumpMergePruned(TComDataCU* cu, Int candidate, Int pass, const char* reason) {
    if (!labActive(cu)) return;
    m_labFile << "{\"event\":\"PRUNED\",\"poc\":" << cu->getSlice()->getPOC()
      << ",\"x\":" << cu->getCUPelX() << ",\"y\":" << cu->getCUPelY()
      << ",\"size\":" << Int(cu->getWidth(0)) << ",\"candidate\":" << candidate
      << ",\"pass\":" << pass << ",\"reason\":\"" << reason << "\"}\n";
    m_labFile.flush();
}

Void VisualDumper::dumpModeTrial(TComDataCU* cu, TComDataCU* best, UInt depth, Double lambda,
                                const char* phase, Int noResidual, TComYuv* org, TComYuv* pred, TComYuv* reco) {
    if (!labActive(cu) || !std::isfinite(cu->getTotalCost()) || cu->getTotalCost() >= MAX_DOUBLE/2) return;
    std::stringstream ss;
    ss << std::setprecision(17);
    ss << "{\"event\":\"TRIAL\",\"poc\":" << cu->getSlice()->getPOC()
       << ",\"x\":" << cu->getCUPelX() << ",\"y\":" << cu->getCUPelY()
       << ",\"size\":" << (cu->getSlice()->getSPS()->getMaxCUWidth() >> depth)
       << ",\"depth\":" << depth << ",\"phase\":\"" << phase << "\""
       << ",\"part\":\"" << (std::string(phase)=="SPLIT" ? "4 CU" : visualPartSize(cu->getPartitionSize(0))) << "\""
       << ",\"qp\":" << Int(cu->getQP(0)) << ",\"bits\":" << cu->getTotalBits()
       << ",\"distortion\":" << cu->getTotalDistortion() << ",\"lambda\":" << lambda
       << ",\"cost\":" << cu->getTotalCost() << ",\"bestBefore\":";
    if (best->getTotalCost() < MAX_DOUBLE/2 && std::isfinite(best->getTotalCost())) ss << best->getTotalCost(); else ss << "null";
    ss << ",\"accepted\":" << (cu->getTotalCost()<best->getTotalCost()?"true":"false")
       << ",\"cbf\":" << Int(cu->getQtRootCbf(0)) << ",\"skip\":" << (cu->getSkipFlag(0)?"true":"false")
       << ",\"pass\":" << noResidual << ",\"candidate\":" << (noResidual>=0 ? Int(cu->getMergeIndex(0)) : -1);
    if (std::string(phase)=="INTER" || std::string(phase)=="MERGE") {
        ss << ",\"pus\":[";
        UInt offset=0;
        PartSize shape=cu->getPartitionSize(0);
        UInt np=shape==SIZE_2Nx2N ? 1 : shape==SIZE_NxN ? 4 : 2;
        for (UInt i=0; i<np; ++i) {
            Int w,h; cu->getPartIndexAndSize(i,offset,w,h);
            if(i) ss << ",";
            ss << "{\"width\":" << w << ",\"height\":" << h << ",\"merge\":" << (cu->getMergeFlag(offset)?"true":"false")
               << ",\"merge_idx\":" << Int(cu->getMergeIndex(offset)) << ",\"inter_dir\":" << Int(cu->getInterDir(offset));
            for(Int l=0;l<2;++l) {
                RefPicList list=RefPicList(l); Int ref=cu->getCUMvField(list)->getRefIdx(offset);
                TComMv mv=cu->getCUMvField(list)->getMv(offset), mvd=cu->getCUMvField(list)->getMvd(offset);
                ss << ",\"l" << l << "\":{\"ref_idx\":" << ref << ",\"ref_poc\":" << (ref>=0 ? cu->getSlice()->getRefPOC(list,ref) : -1)
                   << ",\"mv_x_qpel\":" << mv.getHor() << ",\"mv_y_qpel\":" << mv.getVer()
                   << ",\"mvd_x_qpel\":" << mvd.getHor() << ",\"mvd_y_qpel\":" << mvd.getVer() << "}";
            }
            ss << "}";
        }
        ss << "]";
    }
    if (org && pred && reco) {
        const char* names[]={"org","pred","reco"}; TComYuv* bufs[]={org,pred,reco};
        ss << ",\"patchSize\":8";
        for(Int b=0;b<3;++b) {
            ss << ",\"" << names[b] << "\":[";
            const Pel* p=bufs[b]->getAddr(COMPONENT_Y); UInt stride=bufs[b]->getStride(COMPONENT_Y);
            for(Int y=0;y<8;++y) for(Int x=0;x<8;++x) { if(x||y)ss<<",";ss<<p[y*stride+x]; }
            ss << "]";
        }
    }
    ss << "}\n";
    m_labFile << ss.str(); m_labFile.flush();
}
