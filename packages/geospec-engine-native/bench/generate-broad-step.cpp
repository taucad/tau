#include <BRepAlgoAPI_Cut.hxx>
#include <BRepBndLib.hxx>
#include <BRepCheck_Analyzer.hxx>
#include <BRepGProp.hxx>
#include <BRepPrimAPI_MakeBox.hxx>
#include <BRep_Builder.hxx>
#include <Bnd_Box.hxx>
#include <DESTEP_Parameters.hxx>
#include <GProp_GProps.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <NCollection_Sequence.hxx>
#include <STEPCAFControl_Reader.hxx>
#include <STEPCAFControl_Writer.hxx>
#include <TCollection_AsciiString.hxx>
#include <TDF_Label.hxx>
#include <TDataStd_Name.hxx>
#include <TDocStd_Document.hxx>
#include <TopExp_Explorer.hxx>
#include <TopLoc_Location.hxx>
#include <TopoDS.hxx>
#include <TopoDS_Compound.hxx>
#include <TopoDS_Shape.hxx>
#include <UnitsMethods_LengthUnit.hxx>
#include <XCAFDoc_DocumentTool.hxx>
#include <XCAFDoc_ShapeTool.hxx>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {
constexpr int kOccurrenceSide = 64;
constexpr int kOccurrenceCount = kOccurrenceSide * kOccurrenceSide;
constexpr int kCavitySide = 8;
constexpr int kCavityCount = kCavitySide * kCavitySide;
constexpr int kMaxOccurrences = 65'536;
constexpr std::uintmax_t kMaxSubjectBytes = 64ULL * 1024ULL * 1024ULL;
constexpr std::uintmax_t kMaxGeneratedBytes = 256ULL * 1024ULL * 1024ULL;
constexpr const char *kAp242Schema =
    "AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF";

std::string ordinal_name(int ordinal) {
  std::ostringstream output;
  output << "part-" << std::setw(4) << std::setfill('0') << ordinal;
  return output.str();
}

std::string label_name(const TDF_Label &label) {
  Handle(TDataStd_Name) attribute;
  if (!label.FindAttribute(TDataStd_Name::GetID(), attribute))
    return "";
  return TCollection_AsciiString(attribute->Get(), '?').ToCString();
}

double volume(const TopoDS_Shape &shape) {
  GProp_GProps properties;
  BRepGProp::VolumeProperties(shape, properties);
  return properties.Mass();
}

void set_name(const TDF_Label &label, const std::string &name) {
  TDataStd_Name::Set(label, TCollection_ExtendedString(name.c_str()));
}

DESTEP_Parameters write_parameters() {
  DESTEP_Parameters parameters;
  parameters.WriteSchema = DESTEP_Parameters::WriteMode_StepSchema_AP242DIS;
  parameters.WriteUnit = UnitsMethods_LengthUnit_Millimeter;
  parameters.WriteAssembly = DESTEP_Parameters::WriteMode_Assembly_On;
  parameters.WriteTessellated = DESTEP_Parameters::RWMode_Tessellated_Off;
  parameters.WriteName = true;
  return parameters;
}

void write_document(const Handle(TDocStd_Document) & document,
                    const std::filesystem::path &path) {
  STEPCAFControl_Writer writer;
  writer.SetNameMode(true);
  const auto parameters = write_parameters();
  if (!writer.Transfer(document, parameters, STEPControl_AsIs))
    throw std::runtime_error("AP242 transfer failed");
  if (writer.Write(path.string().c_str()) != IFSelect_RetDone)
    throw std::runtime_error("AP242 write failed");
}

std::string verify_schema(const std::filesystem::path &path) {
  std::ifstream input(path);
  const std::string header((std::istreambuf_iterator<char>(input)),
                           std::istreambuf_iterator<char>());
  if (input.bad() || header.find(kAp242Schema) == std::string::npos) {
    throw std::runtime_error(
        "generated STEP file does not declare AP242 FILE_SCHEMA");
  }
  return kAp242Schema;
}

Handle(TDocStd_Document) read_document(const std::filesystem::path &path) {
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  STEPCAFControl_Reader reader;
  reader.SetNameMode(true);
  if (reader.ReadFile(path.string().c_str()) != IFSelect_RetDone ||
      !reader.Transfer(document)) {
    throw std::runtime_error("STEP XDE roundtrip failed");
  }
  return document;
}

double document_unit_mm(const Handle(TDocStd_Document) & document) {
  double unit = 0;
  if (!XCAFDoc_DocumentTool::GetLengthUnit(
          document, unit, UnitsMethods_LengthUnit_Millimeter)) {
    throw std::runtime_error("STEP document has no source length unit");
  }
  return unit;
}

void generate_many_occurrences(const std::filesystem::path &path) {
  if (kOccurrenceCount > kMaxOccurrences)
    throw std::range_error("occurrence recipe exceeds admission limit");
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  XCAFDoc_DocumentTool::SetLengthUnit(document, 1.0,
                                      UnitsMethods_LengthUnit_Millimeter);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  const TDF_Label part =
      shapes->AddShape(BRepPrimAPI_MakeBox(1.0, 1.0, 1.0).Shape(), false);
  set_name(part, "unit-cube");
  const TDF_Label assembly = shapes->NewShape();
  set_name(assembly, "many-occurrences-4096");
  for (int ordinal = 0; ordinal < kOccurrenceCount; ++ordinal) {
    gp_Trsf transform;
    transform.SetTranslation(gp_Vec(2.0 * (ordinal % kOccurrenceSide),
                                    2.0 * (ordinal / kOccurrenceSide), 0.0));
    set_name(shapes->AddComponent(assembly, part, TopLoc_Location(transform)),
             ordinal_name(ordinal));
  }
  shapes->UpdateAssemblies();
  write_document(document, path);
}

TopoDS_Shape make_void_shape() {
  const TopoDS_Shape outer = BRepPrimAPI_MakeBox(17.0, 17.0, 3.0).Shape();
  TopoDS_Compound cavities;
  BRep_Builder builder;
  builder.MakeCompound(cavities);
  for (int x = 0; x < kCavitySide; ++x) {
    for (int y = 0; y < kCavitySide; ++y) {
      builder.Add(cavities,
                  BRepPrimAPI_MakeBox(gp_Pnt(1.0 + 2.0 * x, 1.0 + 2.0 * y, 1.0),
                                      1.0, 1.0, 1.0)
                      .Shape());
    }
  }
  BRepAlgoAPI_Cut cut(outer, cavities);
  if (!cut.IsDone() || !BRepCheck_Analyzer(cut.Shape()).IsValid())
    throw std::runtime_error("void-heavy cut failed");
  return cut.Shape();
}

void generate_void_heavy(const std::filesystem::path &path) {
  if (kCavityCount > kMaxOccurrences)
    throw std::range_error("cavity recipe exceeds admission limit");
  Handle(TDocStd_Document) document = new TDocStd_Document("BinXCAF");
  XCAFDoc_DocumentTool::SetLengthUnit(document, 1.0,
                                      UnitsMethods_LengthUnit_Millimeter);
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  set_name(shapes->AddShape(make_void_shape(), false), "void-grid-64");
  write_document(document, path);
}

void observe_many_occurrences(std::ostream &output,
                              const Handle(TDocStd_Document) & document) {
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  NCollection_Sequence<TDF_Label> roots;
  shapes->GetFreeShapes(roots);
  if (roots.Length() != 1 || !XCAFDoc_ShapeTool::IsAssembly(roots.Value(1))) {
    throw std::runtime_error("expected one roundtripped XDE assembly");
  }
  NCollection_Sequence<TDF_Label> components;
  if (!XCAFDoc_ShapeTool::GetComponents(roots.Value(1), components) ||
      components.Length() != kOccurrenceCount) {
    throw std::runtime_error("roundtripped occurrence count mismatch");
  }
  for (int index = 1; index <= components.Length(); ++index) {
    const int ordinal = index - 1;
    if (label_name(components.Value(index)) != ordinal_name(ordinal)) {
      throw std::runtime_error("roundtripped occurrence label mismatch");
    }
    const gp_XYZ translation =
        XCAFDoc_ShapeTool::GetLocation(components.Value(index))
            .Transformation()
            .TranslationPart();
    if (translation.X() != 2.0 * (ordinal % kOccurrenceSide) ||
        translation.Y() != 2.0 * (ordinal / kOccurrenceSide) ||
        translation.Z() != 0.0) {
      throw std::runtime_error("roundtripped occurrence placement mismatch");
    }
  }
  output << "\"manyOccurrences\":{\"fileSchema\":\"" << kAp242Schema
         << "\",\"sourceUnit\":\"mm\",\"sourceUnitToMillimeters\":"
         << document_unit_mm(document)
         << ",\"occurrenceCount\":" << components.Length()
         << ",\"firstLabel\":\"" << label_name(components.First())
         << "\",\"lastLabel\":\"" << label_name(components.Last())
         << "\",\"aabb\":{\"min\":[0,0,0],\"max\":[127,127,1]},"
            "\"nominalVolume\":[4096,1],\"nominalSurfaceArea\":[24576,1]}";
}

void observe_void_heavy(std::ostream &output,
                        const Handle(TDocStd_Document) & document) {
  const auto shapes = XCAFDoc_DocumentTool::ShapeTool(document->Main());
  NCollection_Sequence<TDF_Label> roots;
  shapes->GetFreeShapes(roots);
  if (roots.Length() != 1 || label_name(roots.Value(1)) != "void-grid-64") {
    throw std::runtime_error("roundtripped void root mismatch");
  }
  const TopoDS_Shape shape = XCAFDoc_ShapeTool::GetShape(roots.Value(1));
  int solid_count = 0;
  for (TopExp_Explorer solids(shape, TopAbs_SOLID); solids.More();
       solids.Next())
    ++solid_count;
  Bnd_Box bounds;
  BRepBndLib::AddOptimal(shape, bounds, false, false);
  double x_min, y_min, z_min, x_max, y_max, z_max;
  bounds.Get(x_min, y_min, z_min, x_max, y_max, z_max);
  output << ",\"voidHeavy\":{\"fileSchema\":\"" << kAp242Schema
         << "\",\"sourceUnit\":\"mm\",\"sourceUnitToMillimeters\":"
         << document_unit_mm(document)
         << ",\"rootLabel\":\"void-grid-64\",\"solidCount\":" << solid_count
         << ",\"observedVolume\":" << volume(shape)
         << ",\"observedAabb\":{\"min\":[" << x_min << ',' << y_min << ','
         << z_min << "],\"max\":[" << x_max << ',' << y_max << ',' << z_max
         << "]},\"outerDimensions\":[17,17,3],\"cavityCount\":64,"
            "\"nominalMaterialVolume\":[803,1],\"nominalMaterialSurfaceArea\":["
            "1166,1],\"cavityCenters\":\"[(3/2+2i),(3/2+2j),3/2], "
            "i,j=0..7\",\"qualification\":\"nominal-input-only\"}";
}
} // namespace

int main(int argc, char **argv) {
  if (argc != 2)
    return 2;
  try {
    const std::filesystem::path output_directory = argv[1];
    std::filesystem::create_directories(output_directory);
    const auto occurrences_path = output_directory / "many-occurrences.step";
    const auto void_path = output_directory / "void-heavy.step";
    generate_many_occurrences(occurrences_path);
    generate_void_heavy(void_path);
    verify_schema(occurrences_path);
    verify_schema(void_path);
    const auto occurrences_bytes = std::filesystem::file_size(occurrences_path);
    const auto void_bytes = std::filesystem::file_size(void_path);
    if (occurrences_bytes > kMaxSubjectBytes || void_bytes > kMaxSubjectBytes ||
        occurrences_bytes + void_bytes > kMaxGeneratedBytes) {
      throw std::range_error(
          "generated STEP files exceed the frozen byte limits");
    }
    std::ofstream observations(output_directory / "step-observations.json");
    observations << std::setprecision(17) << '{';
    observe_many_occurrences(observations, read_document(occurrences_path));
    observe_void_heavy(observations, read_document(void_path));
    observations << ",\"candidateEngineExecuted\":false,\"timingRun\":false}\n";
    if (!observations)
      throw std::runtime_error("STEP observations write failed");
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
