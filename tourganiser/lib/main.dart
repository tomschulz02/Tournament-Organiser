import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

void main() {
  runApp(const MainApp());
}

class MainApp extends StatelessWidget {
  const MainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (context) => MyAppState(),
      child: MaterialApp(
        title: 'Tourganiser',
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue)
        ),
        home: MyHomePage(),
      ),
    );
  }
}

class MyAppState extends ChangeNotifier {

}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key});

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  var selectedIndex = 1;
  bool expandedNav = false;
  Widget page = HomePage();
  
  @override
  Widget build(BuildContext context) {
    
    final theme = Theme.of(context);

    switch(selectedIndex){
      case 0:
        expandedNav = !expandedNav;
        break;
      case 1:
        page = HomePage();
        break;
      case 2:
        page = CreateTournamentPage();
        break;
      case 3:
        page = LoadTournamentPage();
        break;
      default:
        throw UnimplementedError('no page created for $selectedIndex');
    }
    
    return LayoutBuilder(
      builder: (context, constraints) {
        return Scaffold(
          body: Row(
            children: [
              SafeArea(
                child: NavigationRail(
                  backgroundColor: theme.colorScheme.primaryContainer,
                  extended: expandedNav || constraints.maxWidth>=600,
                  destinations: [
                    NavigationRailDestination(
                      icon: Tooltip(message: 'Expand', child: Icon(Icons.menu),), 
                      label: Text(''),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.home), 
                      label: Text('Home')
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.add_box_outlined), 
                      label: Text('New')
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.file_open_outlined), 
                      label: Text('Load')
                    ),
                  ],
                  selectedIndex: selectedIndex,
                  onDestinationSelected: (value) {
                    setState(() {
                      selectedIndex = value;
                    });
                    //print('selected $selectedIndex');
                  },
                ),
              ),
              Expanded(
                child: Container( 
                  child: page,
                ),
              ),
            ],
          ),
        );
      }
    );
  }
}

class CreateTournamentPage extends StatelessWidget {
  const CreateTournamentPage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Create a Tournament'),
      ),
      body: Column(
        children: [
          Divider(indent: 20, endIndent: 20,),
          Padding(
            padding: const EdgeInsets.all(20.0),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Expanded(
                  flex: 2,
                  child: TextField(
                    decoration: InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Enter a tournament name'
                    ),
                  ),
                ),
                SizedBox(width: 20,),
                Expanded(
                  flex: 1,
                  child: TextField(
                    decoration: InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Tournament starting date'
                    ),
                  ),
                ),
              ],
            ),
          ),
          Divider(indent: 20, endIndent: 20,),
          Row(),
          Row(),
          Row(),
          Divider(indent: 20, endIndent: 20,),
          //Teams list
        ],
      ),
    );
  }
}

class LoadTournamentPage extends StatelessWidget {
  const LoadTournamentPage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('History'),
    );
  }
}

class HomePage extends StatelessWidget {
  const HomePage({
    super.key,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('Welcome'),
    );
  }
}
