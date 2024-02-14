import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

//This page asks the user for all the settings to create a competition

enum CompetitionFormat { tournament, league }
enum EliminationRound {
  roundOf16('Round of 16', 16),
  roundOf12('Round of 12', 12),
  quarterFinals('Quarterfinals', 8),
  semiFinals('Semifinals', 4),
  finals('Finals', 2);

  const EliminationRound(this.label, this.numOfTeams);
  final String label;
  final int numOfTeams;
}

const double selectionFieldWidth = 200;
const double selectionFieldHeight = 50;
const double edgePadding = 40;

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
      body: CreateTournamentForm(),
    );
  }
}

class CreateTournamentForm extends StatefulWidget {
  const CreateTournamentForm({
    super.key,
  });

  @override
  State<CreateTournamentForm> createState() => _CreateTournamentFormState();
}

class _CreateTournamentFormState extends State<CreateTournamentForm> {
  
  //create form key
  final _createFormKey = GlobalKey<FormState>();

  //controllers for all various inputs to get values on submission
  final _compNameController = TextEditingController();
  final _numTeamsController = TextEditingController();
  final _numGroupsController = TextEditingController();
  final _eliminationController = TextEditingController();

  //competition format radio group value
  CompetitionFormat? _competitionFormat = CompetitionFormat.tournament;

  //elimination round selected value
  EliminationRound? _eliminationRound;

  //cleans up the controllers when the widget is disposed
  @override
  void dispose() {
    _compNameController.dispose();
    _numTeamsController.dispose();
    _numGroupsController.dispose();
    _eliminationController.dispose();
    super.dispose();
  }

  void submit() {
    //TODO: Add the submit function to create a new competition
    print(_compNameController.text);
    print(int.parse(_numTeamsController.text));
    print(int.parse(_numGroupsController.text));
    print(_eliminationRound!.numOfTeams);
  }
  
  @override
  Widget build(BuildContext context) {
    return Form(
      key: _createFormKey,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(width: 15),
              Text(
                '*required fields', 
                style: TextStyle(fontSize: 12, color: Color.fromRGBO(255, 0, 0, 1)),
              ),
            ],
          ),

          //=======================================
          //Competition Name with submission button
          //=======================================
          Padding(
            padding: const EdgeInsets.fromLTRB(edgePadding, 15, edgePadding, 15),
            child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Expanded(
                    child: TextFormField(
                      decoration: InputDecoration(
                        border: OutlineInputBorder(),
                        label: Text('Name of competition*'),
                      ),
                      controller: _compNameController,
                      validator: (value) {
                        //TODO: add another condition that checks if it is a valid name
                        if (value==null || value.isEmpty) {
                          return "This is a required field";
                        }
                        return null;
                      },
                    ),
                  ),
                  SizedBox(width: 20,),
                  ConstrainedBox(
                    constraints: BoxConstraints(maxWidth: selectionFieldWidth, minHeight: selectionFieldHeight),
                    child: ElevatedButton(
                      child: Text('Create'),
                      onPressed: () {
                        //function for what is done with the user input on submission
                        //eventually it will lead to the backend and create a competetion class object
                        //see https://docs.flutter.dev/cookbook/forms/validation for reference
                        if (_createFormKey.currentState!.validate()) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('Form valid, but no submit function has been created.'))
                          );
                          submit();
                        } else {
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text('There are some fields that aren\'t vaild. Please try again.'))
                          );
                        }
                      },
                    ),
                  ),
                ],
              ),
          ),

          const Divider(indent: 15, endIndent: 15,),

          //===========================================================
          //Competition format settings (e.g. type, elimination rounds)
          //===========================================================
          Row(
            children: [
              SizedBox(width: 30,),
              Text('Choose the competition format:*', style: TextStyle(fontSize: 18),),
            ],
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 5),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Expanded(
                  child: RadioListTile(
                    title: Text('Tournament'),
                    //subtitle: Text('Group stages, into elimination rounds, ending in a final'),
                    value: CompetitionFormat.tournament,
                    groupValue: _competitionFormat, 
                    onChanged: (CompetitionFormat? value) {
                      setState(() {
                        _competitionFormat = value;
                        print('$_competitionFormat');
                      });
                    }
                  ),
                ),
                Expanded(
                  child: RadioListTile(
                    title: Text('League'),
                    //subtitle: Text('Round robin with all teams, optional elimination rounds'),
                    value: CompetitionFormat.league,
                    groupValue: _competitionFormat, 
                    onChanged: (CompetitionFormat? value) {
                      setState(() {
                        _competitionFormat = value;
                        print('$_competitionFormat');
                      });
                    }
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(edgePadding, 15, edgePadding, 15),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _numTeamsController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    decoration: InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Number of teams*',
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty){
                        return "This is a required field";
                      }
                      //TODO: add an additional validation check to make sure it is a number (That makes sense)
                      return null;
                    },
                  ),
                ),
                SizedBox(width: 50,),
                Expanded(
                  child: TextFormField(
                    controller: _numGroupsController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                    ],
                    decoration: InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: 'Number of groups*',
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty){
                        return "This is a required field";
                      }
                      //TODO: add an additional validation check to make sure it is a number (That makes sense)
                      return null;
                    },
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(edgePadding, 5, edgePadding, 15),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Expanded(
                  child: Text(
                    'First elimination round:',
                    style: TextStyle(fontSize: 15),
                  ),
                ),
                ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: selectionFieldWidth, maxHeight: selectionFieldHeight),
                  child: DropdownMenu(
                    initialSelection: EliminationRound.roundOf16,
                    controller: _eliminationController,
                    dropdownMenuEntries: EliminationRound.values.map((EliminationRound eliminationRound) {
                      return DropdownMenuEntry(
                        value: eliminationRound,
                        label: eliminationRound.label,
                      );
                    }).toList(),
                    onSelected: (EliminationRound? eliminationRound) {
                      _eliminationRound = eliminationRound;
                    },
                  ),
                ),
              ],
            ),
          ),

          const Divider(indent: 15, endIndent: 15,),
        ],
      ),
    );
  }
}