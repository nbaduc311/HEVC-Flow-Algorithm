#ifndef VISUAL_DUMPER_H
#define VISUAL_DUMPER_H

#include "CommonDef.h"
#include <string>
#include <fstream>
#include <iostream>
#include <vector>
#include <map>
#include <sstream>
#include <iomanip>

class TComDataCU;
class TComYuv;
class TComRdCost;
class TComTU;
class TComMv;
class TComMvField;

#define ENABLE_VISUAL_DUMP 1

class VisualDumper {
private:
    static VisualDumper* s_instance;
    std::string m_outputDir;
    std::ofstream m_outFile;
    std::ofstream m_labFile;
    Bool labActive(const TComDataCU* cu);
    std::ofstream m_labInterFile;
    UInt m_labInterSearch, m_labMotionAttempt;
    const TComDataCU* m_labMotionCU;
    Int m_labMotionPU;
    std::ofstream m_labIntraFile;
    UInt m_labIntraSearch, m_labIntraAttempt, m_labLumaBits;
    const char* m_labIntraPass;
    std::string labIntraPrefix(TComDataCU* cu, TComTU& tu, const char* stage);
    std::vector<std::string> m_labRate;
    std::map<UInt, std::vector<std::string> > m_labChildren;
    UInt m_labLastBits;

    
    Bool m_enabled;
    Bool m_exitOnFinish;
    Int m_targetPOC;
    Int m_targetCtuX;
    Int m_targetCtuY;
    Int m_targetCuSize;
    
    Int m_currentPOC;
    Int m_currentCtuX;
    Int m_currentCtuY;
    Int m_dumpCount;
    Int m_intraSearchCount;
    Bool m_intraRefDumped;

    VisualDumper();
    ~VisualDumper();

public:
    static VisualDumper* getInstance() {
        if (!s_instance) s_instance = new VisualDumper();
        return s_instance;
    }

    Bool isEnabled() const { return m_enabled; }

    Void setROI(Int poc, Int ctuX, Int ctuY, Int cuSize) {
        m_targetPOC = poc;
        m_targetCtuX = ctuX;
        m_targetCtuY = ctuY;
        m_targetCuSize = cuSize;
    }

    Void setContext(Int poc, Int ctuX, Int ctuY) {
        m_currentPOC = poc;
        m_currentCtuX = ctuX;
        m_currentCtuY = ctuY;
    }
    
    Bool isActive(Int cuSize) const { 
        return m_enabled &&
               (m_currentPOC == m_targetPOC) && 
               (m_currentCtuX == m_targetCtuX) && 
               (m_currentCtuY == m_targetCtuY) &&
               (m_targetCuSize <= 0 || cuSize == m_targetCuSize); 
    }

    Void dumpIntraRefSamples(Int cuSize,
                             const Pel* pRefUnfilt, const Pel* pRefFilt, Int refStride,
                             Bool strongIntraSmoothing,
                             const Pel* pRefUnfiltU, const Pel* pRefUnfiltV,
                             const Pel* pRefFiltU, const Pel* pRefFiltV, Int refStrideC);

    Void dumpIntraSearchStep(Int cuSize, Int mode, Double cost, Bool bUseFilter,
                             const Pel* pOrg, const Pel* pPred, const Pel* pResi, Int stride,
                             const Pel* pRef, Int refStride,
                             const Pel* pOrgU, const Pel* pOrgV,
                             const Pel* pPredU, const Pel* pPredV,
                             Int strideC, Int predStrideC,
                             const Pel* pRefU, const Pel* pRefV);

    Void dumpPartitionTree(TComDataCU* pcCU);

    Void dumpModeTrial(TComDataCU* cu, TComDataCU* best, UInt depth, TComRdCost* rd,
                       const char* phase, Int noResidual, TComYuv* org, TComYuv* pred, TComYuv* reco);
    Bool labInterActive(const TComDataCU* cu);
    Void labInterBegin(const TComDataCU* cu, const char* kind);
    Void labInter(const TComDataCU* cu, Int pu, const char* stage, const std::string& fields);
    Void labMergeSource(const TComDataCU* cu, UInt pu, const char* source, const char* status, Int index, const TComMvField* fields, Int dir);
    static std::string labMv(const TComMv& mv);
    static std::string labFields(const TComDataCU* cu, const TComMvField* fields, Int dir);
    Void labMotionBegin(const TComDataCU* cu, Int pu);
    Void labMotionEnd() { m_labMotionCU=NULL; }
    Void labFraction(const TComMv& mv, Int scale, UInt point, Distortion distortion, Distortion rateCost, Distortion cost, Distortion best, Bool hadamard, UInt bits, Double motionLambda);
    Void labIntraBegin(TComDataCU* cu);
    Void labIntraAttempt(TComDataCU* cu, const char* pass);
    Void labIntraFast(TComDataCU* cu, TComTU& tu, UInt mode, Distortion sad, UInt bits, Double lambda, Double cost, Bool hadamard, Bool filtered, TComYuv* org, TComYuv* pred);
    Void labIntraList(TComDataCU* cu, TComTU& tu, const char* stage, const UInt* modes, UInt count, UInt baseCount);
    Void labIntraTu(TComTU& tu, Distortion d, UInt bits, Double lambda, Double cost, Double single, Double split, Bool choseSplit);
    Void labIntraMode(TComDataCU* cu, TComTU& tu, const char* stage, UInt mode, Distortion d, UInt bits, Double lambda, Double cost, Double best);
    UInt labLumaBits() const { return m_labLumaBits; }
    Void labRateBegin(TComDataCU* cu);
    Void labRateStep(TComDataCU* cu, const char* label, UInt bits, Int64 fracBits = -1);
    Void labSplitChild(TComDataCU* parent, TComDataCU* child, UInt depth, UInt index);
    Void dumpMergePruned(TComDataCU* cu, Int candidate, Int pass, const char* reason);

    Void dumpTransformQuant(Int poc, Int ctuX, Int ctuY, Int tuX, Int tuY, Int tuWidth, Int tuHeight,
                            Int compID, Int qp,
                            const Pel* pResi, Int resiStride,
                            const TCoeff* pDctCoeff, const TCoeff* pQCoeff);
};

#if ENABLE_VISUAL_DUMP
    #define DUMP_SET_ROI(poc, ctuX, ctuY, cuSize) VisualDumper::getInstance()->setROI(poc, ctuX, ctuY, cuSize)
    #define DUMP_SET_CONTEXT(poc, ctuX, ctuY) VisualDumper::getInstance()->setContext(poc, ctuX, ctuY)
#else
    #define DUMP_SET_ROI(poc, ctuX, ctuY, cuSize)
    #define DUMP_SET_CONTEXT(poc, ctuX, ctuY)
#endif


// Build payloads only within the observed CTU; never call coding routines here.
#define LAB_INTER(cu, pu, stage, fields) do { VisualDumper* labD=VisualDumper::getInstance(); if(labD->labInterActive(cu)) { std::ostringstream labS; labS<<std::setprecision(17)<<fields; labD->labInter(cu,pu,stage,labS.str()); } } while(0)

#endif
